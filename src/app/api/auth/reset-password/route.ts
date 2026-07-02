import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { successResponse, ApiErrors } from "@/lib/api-response";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const { token, password } = parsed.data;

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return ApiErrors.validation({ password: strength.errors });
    }

    const tokenHash = hashToken(token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return ApiErrors.validation({
        token: ["This reset link is invalid or has expired. Please request a new one."],
      });
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all existing sessions — force re-login everywhere
      prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    return successResponse({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return ApiErrors.internal();
  }
}
