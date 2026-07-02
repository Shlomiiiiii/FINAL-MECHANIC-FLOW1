/**
 * POST /api/portal/auth/request-otp
 * Looks up customer by email + shop slug.
 * Creates 6-digit OTP, sends via email using Resend.
 * Rate-limited: max 3 per 15 minutes per email.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPortalOtp, logPortalAction } from "@/lib/portal/auth";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Valid email required"),
  slug:  z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { email, slug } = parsed.data;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    // Find organization by slug
    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, customerPortalEnabled: true },
    });
    if (!org || !org.customerPortalEnabled) {
      // Always return 200 to prevent email enumeration
      return NextResponse.json({ sent: true });
    }

    // Find customer by email in this org
    const customer = await prisma.customer.findFirst({
      where: {
        organizationId: org.id,
        email:          { equals: email, mode: "insensitive" },
        deletedAt:      null,
      },
      select: { id: true, firstName: true, email: true },
    });

    if (!customer) {
      // Return 200 to prevent email enumeration
      return NextResponse.json({ sent: true });
    }

    // Rate limit: max 3 OTPs in 15 minutes
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const recentCount = await prisma.portalOtp.count({
      where: { customerId: customer.id, createdAt: { gte: cutoff } },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many requests. Please wait 15 minutes before trying again." },
        { status: 429 }
      );
    }

    const otp = await createPortalOtp({
      customerId:     customer.id,
      organizationId: org.id,
      email,
    });

    // Send OTP email via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    process.env.RESEND_FROM_EMAIL ?? "noreply@mechanicflow.com",
            to:      [email],
            subject: `Your ${org.name} login code: ${otp}`,
            html: `
              <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
                <h2 style="margin:0 0 8px;color:#1e293b">Your login code</h2>
                <p style="color:#64748b;margin:0 0 24px">Hi ${customer.firstName}, here's your ${org.name} customer portal code:</p>
                <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                  <p style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1e293b;margin:0">${otp}</p>
                  <p style="color:#94a3b8;font-size:12px;margin:8px 0 0">Expires in ${15} minutes</p>
                </div>
                <p style="color:#94a3b8;font-size:12px">If you didn't request this code, you can safely ignore this email.</p>
              </div>
            `,
          }),
        });
      } catch (e) {
        console.error("Failed to send OTP email:", e);
        // Continue — don't block login if email fails in dev
      }
    } else {
      // Dev mode: log to console
      console.log(`\n🔑 PORTAL OTP for ${email}: ${otp}\n`);
    }

    await logPortalAction({
      organizationId: org.id,
      customerId:     customer.id,
      action:         "otp_requested",
      ipAddress:      ip,
      metadata:       { email },
    });

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("POST /api/portal/auth/request-otp:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
