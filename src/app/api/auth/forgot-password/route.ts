import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { successResponse, ApiErrors } from "@/lib/api-response";

const RESET_TOKEN_TTL_MINUTES = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const { email, organizationSlug } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug.toLowerCase().trim() },
      select: { id: true, name: true },
    });

    // Always return success to prevent account enumeration
    if (!organization) return successResponse({ sent: true });

    const user = await prisma.user.findUnique({
      where: {
        organizationId_email: { organizationId: organization.id, email: normalizedEmail },
      },
      select: { id: true, isActive: true, fullName: true },
    });

    if (!user || !user.isActive) return successResponse({ sent: true });

    // Invalidate any outstanding tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@mechanicflow.com",
            to: [normalizedEmail],
            subject: `Reset your ${organization.name} password`,
            html: `
              <div style="font-family:sans-serif;max-width:440px;margin:0 auto;padding:32px">
                <h2 style="color:#1e293b;margin:0 0 8px">Reset your password</h2>
                <p style="color:#64748b;margin:0 0 24px">Hi ${user.fullName}, we received a request to reset your password. This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>
                <a href="${resetLink}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Reset password</a>
                <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">If you didn't request this, you can safely ignore this email.</p>
              </div>
            `,
          }),
        });
      } catch (e) {
        console.error("Failed to send reset email:", e);
      }
    } else {
      console.log(`\n🔑 PASSWORD RESET LINK for ${normalizedEmail}:\n${resetLink}\n`);
    }

    return successResponse({ sent: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return ApiErrors.internal();
  }
}
