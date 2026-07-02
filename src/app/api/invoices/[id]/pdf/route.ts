import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ApiErrors } from "@/lib/api-response";
import { logInvoiceEvent } from "@/lib/invoice-utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, phonePrimary: true, addressLine1: true, addressLine2: true, city: true, state: true, zip: true } },
        vehicle:  { select: { year: true, make: true, model: true, trim: true, vin: true, licensePlate: true, mileageLastSeen: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { where: { status: "SUCCEEDED" }, orderBy: { processedAt: "desc" } },
        organization: { select: { name: true, phone: true, email: true, logoUrl: true, addressLine1: true, city: true, state: true, zip: true, invoiceTerms: true, taxLabel: true } },
      },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");

    const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const payUrl = `${appUrl}/portal/invoices/${invoice.paymentLinkToken}`;

    // Group line items by category
    const grouped: Record<string, typeof invoice.lineItems> = {};
    for (const li of invoice.lineItems) {
      const cat = li.category ?? "Services";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(li);
    }

    const lineItemsHtml = Object.entries(grouped).map(([cat, items]) => `
      <tr><td colspan="4" style="padding:10px 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;">${cat}</td></tr>
      ${items.map(li => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#1e293b;">
          ${li.description}
          ${li.laborHours ? `<span style="color:#94a3b8;font-size:11px;"> · ${Number(li.laborHours).toFixed(1)}h</span>` : ""}
          ${li.warranty ? `<div style="font-size:11px;color:#16a34a;margin-top:2px;">⚡ ${li.warranty}</div>` : ""}
        </td>
        <td style="padding:7px 12px;font-size:13px;color:#475569;text-align:right;">${Number(li.quantity)}</td>
        <td style="padding:7px 12px;font-size:13px;color:#475569;text-align:right;">${fmt(li.unitPriceCents)}</td>
        <td style="padding:7px 0;font-size:13px;font-weight:500;text-align:right;">${fmt(li.totalCents)}</td>
      </tr>`).join("")}`).join("");

    const vehicleStr = invoice.vehicle
      ? `${invoice.vehicle.year ?? ""} ${invoice.vehicle.make ?? ""} ${invoice.vehicle.model ?? ""} ${invoice.vehicle.trim ?? ""}`.trim()
      : null;

    const statusColor = invoice.status === "PAID" ? "#16a34a" : invoice.status === "OVERDUE" ? "#ef4444" : "#3b82f6";
    const isOverdue   = invoice.status === "OVERDUE" || (invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.balanceCents > 0);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;padding:48px;font-size:13px;}@media print{body{padding:24px;}}</style>
</head><body>
<table width="100%" style="margin-bottom:40px;border-collapse:collapse;">
  <tr>
    <td>
      <p style="font-size:24px;font-weight:700;color:#1e293b;">${invoice.organization.name}</p>
      ${invoice.organization.addressLine1 ? `<p style="color:#64748b;font-size:12px;margin-top:4px;">${invoice.organization.addressLine1}, ${invoice.organization.city}, ${invoice.organization.state} ${invoice.organization.zip}</p>` : ""}
      ${invoice.organization.phone ? `<p style="color:#64748b;font-size:12px;">${invoice.organization.phone}</p>` : ""}
      ${invoice.organization.email ? `<p style="color:#64748b;font-size:12px;">${invoice.organization.email}</p>` : ""}
    </td>
    <td style="text-align:right;">
      <p style="font-size:26px;font-weight:700;color:${statusColor};">INVOICE</p>
      <p style="font-size:20px;font-weight:600;color:#1e293b;">${invoice.invoiceNumber}</p>
      <p style="color:#64748b;font-size:12px;margin-top:4px;">Date: ${new Date(invoice.createdAt).toLocaleDateString("en-US")}</p>
      ${invoice.dueDate ? `<p style="color:${isOverdue ? "#ef4444" : "#64748b"};font-size:12px;font-weight:${isOverdue ? "600" : "400"};">Due: ${new Date(invoice.dueDate).toLocaleDateString("en-US")}${isOverdue ? " — OVERDUE" : ""}</p>` : ""}
      ${invoice.poNumber ? `<p style="color:#64748b;font-size:12px;">PO: ${invoice.poNumber}</p>` : ""}
    </td>
  </tr>
</table>

<table width="100%" style="margin-bottom:32px;border-collapse:collapse;">
  <tr>
    <td width="50%" style="padding-right:24px;vertical-align:top;">
      <p style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Bill To</p>
      <p style="font-weight:600;font-size:14px;">${invoice.customer.firstName} ${invoice.customer.lastName}</p>
      ${invoice.customer.phonePrimary ? `<p style="color:#475569;margin-top:2px;">${invoice.customer.phonePrimary}</p>` : ""}
      ${invoice.customer.email ? `<p style="color:#475569;">${invoice.customer.email}</p>` : ""}
      ${invoice.customer.addressLine1 ? `<p style="color:#475569;">${invoice.customer.addressLine1}${invoice.customer.city ? `, ${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.zip}` : ""}</p>` : ""}
    </td>
    ${vehicleStr ? `
    <td width="50%" style="vertical-align:top;">
      <p style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Vehicle</p>
      <p style="font-weight:600;font-size:14px;">${vehicleStr}</p>
      ${invoice.vehicle?.licensePlate ? `<p style="color:#475569;margin-top:2px;">Plate: ${invoice.vehicle.licensePlate}</p>` : ""}
      ${invoice.vehicle?.vin ? `<p style="color:#475569;font-size:11px;font-family:monospace;">VIN: ${invoice.vehicle.vin}</p>` : ""}
      ${invoice.vehicle?.mileageLastSeen ? `<p style="color:#475569;">Mileage: ${invoice.vehicle.mileageLastSeen.toLocaleString()} mi</p>` : ""}
    </td>` : "<td></td>"}
  </tr>
</table>

<table width="100%" style="margin-bottom:32px;border-collapse:collapse;">
  <thead>
    <tr style="border-bottom:2px solid #e2e8f0;">
      <th style="padding:8px 0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:left;">Description</th>
      <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Qty</th>
      <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Price</th>
      <th style="padding:8px 0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Total</th>
    </tr>
  </thead>
  <tbody>${lineItemsHtml}</tbody>
</table>

<table width="100%" style="margin-bottom:32px;">
  <tr><td width="55%"></td>
    <td width="45%">
      <table width="100%" style="border-top:1px solid #e2e8f0;padding-top:12px;">
        <tr><td style="padding:4px 0;color:#475569;">Subtotal</td><td style="text-align:right;font-weight:500;">${fmt(invoice.subtotalCents)}</td></tr>
        ${invoice.discountCents > 0 ? `<tr><td style="padding:4px 0;color:#16a34a;">Discount</td><td style="text-align:right;color:#16a34a;">-${fmt(invoice.discountCents)}</td></tr>` : ""}
        ${invoice.taxCents > 0 ? `<tr><td style="padding:4px 0;color:#475569;">${invoice.organization.taxLabel ?? "Tax"}</td><td style="text-align:right;">${fmt(invoice.taxCents)}</td></tr>` : ""}
        <tr style="border-top:2px solid #1e293b;"><td style="padding:8px 0 0;font-size:16px;font-weight:700;">Total</td><td style="text-align:right;font-size:16px;font-weight:700;padding-top:8px;">${fmt(invoice.totalCents)}</td></tr>
        ${invoice.amountPaidCents > 0 ? `<tr><td style="padding:4px 0;color:#16a34a;">Paid</td><td style="text-align:right;color:#16a34a;">-${fmt(invoice.amountPaidCents)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:700;color:${invoice.balanceCents > 0 ? "#ef4444" : "#16a34a"};">Balance Due</td><td style="text-align:right;font-weight:700;color:${invoice.balanceCents > 0 ? "#ef4444" : "#16a34a"};">${fmt(invoice.balanceCents)}</td></tr>` : ""}
      </table>
    </td>
  </tr>
</table>

${invoice.warrantyText ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin-bottom:16px;"><p style="font-size:10px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Warranty</p><p style="color:#166534;font-size:13px;">${invoice.warrantyText}</p></div>` : ""}
${invoice.notes ? `<div style="margin-bottom:16px;"><p style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">Notes</p><p style="color:#475569;">${invoice.notes}</p></div>` : ""}
${invoice.organization.invoiceTerms ? `<div style="border-top:1px solid #e2e8f0;padding-top:12px;"><p style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">Terms &amp; Conditions</p><p style="color:#94a3b8;font-size:11px;">${invoice.organization.invoiceTerms}</p></div>` : ""}

${invoice.balanceCents > 0 ? `
<div style="margin-top:24px;text-align:center;padding:16px;background:#eff6ff;border-radius:8px;">
  <p style="color:#1e40af;font-size:13px;margin-bottom:6px;">Pay online:</p>
  <p style="color:#3b82f6;font-size:11px;word-break:break-all;">${payUrl}</p>
</div>` : `
<div style="margin-top:24px;text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;">
  <p style="color:#16a34a;font-size:15px;font-weight:600;">✓ PAID IN FULL</p>
  ${invoice.paidAt ? `<p style="color:#15803d;font-size:12px;margin-top:4px;">Paid ${new Date(invoice.paidAt).toLocaleDateString("en-US")}</p>` : ""}
</div>`}
</body></html>`;

    // Track download
    await prisma.invoice.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
    await logInvoiceEvent(id, "downloaded", { userId: user.id });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Invoice-Number": invoice.invoiceNumber,
      },
    });
  } catch (err) {
    console.error("GET /pdf:", err);
    return ApiErrors.internal();
  }
}
