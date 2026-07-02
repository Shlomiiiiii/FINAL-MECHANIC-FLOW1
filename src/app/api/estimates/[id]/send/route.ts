import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, phonePrimary: true, portalToken: true } },
        organization: { select: { name: true, phone: true, email: true, logoUrl: true } },
      },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");
    if (!["DRAFT", "SENT"].includes(estimate.status)) {
      return ApiErrors.businessLogic("This estimate cannot be sent in its current status.");
    }

    const body = await request.json().catch(() => ({}));
    const channel = (body.channel as string) ?? "email"; // 'email' | 'sms' | 'both'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portalUrl = `${appUrl}/portal/estimates/${estimate.id}?token=${estimate.customer.portalToken}`;

    const sent = { email: false, sms: false };

    // ── Email ──────────────────────────────────────────────────────────────────
    if ((channel === "email" || channel === "both") && estimate.customer.email) {
      const total = `$${(estimate.totalCents / 100).toFixed(2)}`;
      const expiryLine = estimate.expiresAt
        ? `This estimate expires on ${new Date(estimate.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
        : "";

      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@mechanicflow.com",
          to: estimate.customer.email,
          subject: `Estimate ${estimate.estimateNumber} from ${estimate.organization.name} — ${total}`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#1e293b;padding:28px 32px;">
      <p style="color:#fff;font-size:20px;font-weight:600;margin:0;">${estimate.organization.name}</p>
      <p style="color:#94a3b8;font-size:14px;margin:4px 0 0;">Estimate ${estimate.estimateNumber}</p>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Hi ${estimate.customer.firstName},</p>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
        We've prepared an estimate for your vehicle. Please review and approve at your convenience.
        ${expiryLine}
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <p style="font-size:13px;color:#64748b;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Estimate total</p>
        <p style="font-size:28px;font-weight:600;color:#1e293b;margin:0;">${total}</p>
        <p style="font-size:14px;color:#64748b;margin:8px 0 0;">${estimate.title}</p>
      </div>
      <a href="${portalUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:15px;font-weight:500;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px;">
        View &amp; Approve Estimate →
      </a>
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        Or copy this link: ${portalUrl}
      </p>
      ${estimate.organization.phone ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="color:#64748b;font-size:13px;margin:0;">Questions? Call us at <a href="tel:${estimate.organization.phone}" style="color:#3b82f6;">${estimate.organization.phone}</a></p>` : ""}
    </div>
  </div>
</body>
</html>`,
        });
        sent.email = true;
      } catch (emailErr) {
        console.error("Email send failed:", emailErr);
      }
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    if ((channel === "sms" || channel === "both") && estimate.customer.phonePrimary) {
      // Twilio integration — POST to Twilio Messages API
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioToken && twilioFrom) {
        try {
          const msg = `Hi ${estimate.customer.firstName}! ${estimate.organization.name} has sent you an estimate for $${(estimate.totalCents / 100).toFixed(2)}. Review & approve: ${portalUrl}`;
          const form = new URLSearchParams({
            To: estimate.customer.phonePrimary,
            From: twilioFrom,
            Body: msg,
          });
          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form.toString(),
          });
          if (res.ok) sent.sms = true;
        } catch (smsErr) {
          console.error("SMS send failed:", smsErr);
        }
      }
    }

    // Update estimate status and sentAt
    const updated = await prisma.estimate.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    // Notification log
    await prisma.notification.create({
      data: {
        organizationId: user.organizationId,
        customerId: estimate.customerId,
        type: "estimate_sent",
        channel: "EMAIL",
        subject: `Estimate ${estimate.estimateNumber} sent`,
        body: `Estimate sent to ${estimate.customer.firstName} ${estimate.customer.lastName}`,
        status: sent.email ? "SENT" : "FAILED",
        sentAt: sent.email ? new Date() : undefined,
        referenceType: "estimate",
        referenceId: id,
      },
    });

    return successResponse({ estimate: updated, sent });
  } catch (err) {
    console.error("POST /api/estimates/[id]/send:", err);
    return ApiErrors.internal();
  }
}
