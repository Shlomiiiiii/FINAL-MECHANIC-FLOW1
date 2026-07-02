import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { logInvoiceEvent } from "@/lib/invoice-utils";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, phonePrimary: true, portalToken: true } },
        organization: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");
    if (!["DRAFT","SENT","OVERDUE"].includes(invoice.status)) {
      return ApiErrors.businessLogic("Invoice cannot be sent in its current status.");
    }

    const body    = await request.json().catch(() => ({}));
    const channel = (body.channel as string) ?? "email";
    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portalUrl = `${appUrl}/portal/invoices/${invoice.paymentLinkToken}`;
    const total   = `$${(invoice.totalCents / 100).toFixed(2)}`;
    const balance = `$${(invoice.balanceCents / 100).toFixed(2)}`;
    const dueStr  = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "Upon receipt";

    const sent = { email: false, sms: false };

    // ── Email ──────────────────────────────────────────────────────────────────
    if ((channel === "email" || channel === "both") && invoice.customer.email) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@mechanicflow.com",
          to: invoice.customer.email,
          subject: `Invoice ${invoice.invoiceNumber} from ${invoice.organization.name} — ${balance} due`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#1e293b;padding:28px 32px;">
      <p style="color:#fff;font-size:20px;font-weight:600;margin:0;">${invoice.organization.name}</p>
      <p style="color:#94a3b8;font-size:14px;margin:4px 0 0;">Invoice ${invoice.invoiceNumber}</p>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">Hi ${invoice.customer.firstName},</p>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Thank you for your business. Please find your invoice below.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <div>
            <p style="font-size:12px;color:#64748b;margin:0 0 2px;text-transform:uppercase;letter-spacing:.05em;">Balance due</p>
            <p style="font-size:28px;font-weight:700;color:#1e293b;margin:0;">${balance}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:12px;color:#64748b;margin:0 0 2px;">Due date</p>
            <p style="font-size:15px;font-weight:600;color:${invoice.balanceCents > 0 && invoice.dueDate && new Date(invoice.dueDate) < new Date() ? '#ef4444' : '#1e293b'};margin:0;">${dueStr}</p>
          </div>
        </div>
        <p style="font-size:13px;color:#64748b;margin:8px 0 0;">Invoice total: ${total}</p>
      </div>
      <a href="${portalUrl}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:15px;font-weight:500;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:16px;">
        View Invoice &amp; Pay Online →
      </a>
      ${invoice.organization.phone ? `<p style="color:#94a3b8;font-size:13px;margin-top:16px;">Questions? Call <a href="tel:${invoice.organization.phone}" style="color:#3b82f6;">${invoice.organization.phone}</a></p>` : ""}
    </div>
  </div>
</body></html>`,
        });
        sent.email = true;
      } catch (e) {
        console.error("Email send failed:", e);
      }
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    if ((channel === "sms" || channel === "both") && invoice.customer.phonePrimary) {
      const sid   = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from  = process.env.TWILIO_PHONE_NUMBER;
      if (sid && token && from) {
        try {
          const msg = `Hi ${invoice.customer.firstName}! Invoice ${invoice.invoiceNumber} from ${invoice.organization.name} — ${balance} due ${dueStr}. Pay online: ${portalUrl}`;
          const form = new URLSearchParams({ To: invoice.customer.phonePrimary, From: from, Body: msg });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
          });
          sent.sms = true;
        } catch (e) { console.error("SMS failed:", e); }
      }
    }

    // Update invoice status + sentAt
    await prisma.invoice.update({
      where: { id },
      data: { status: "SENT", sentAt: invoice.sentAt ?? new Date() },
    });

    await logInvoiceEvent(id, "sent", {
      userId: user.id,
      note: `Invoice sent via ${channel}`,
      metadata: { channel, emailSent: sent.email, smsSent: sent.sms },
    });

    return successResponse({ sent });
  } catch (err) {
    console.error("POST /send:", err);
    return ApiErrors.internal();
  }
}
