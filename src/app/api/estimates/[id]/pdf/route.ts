import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, phonePrimary: true, addressLine1: true, city: true, state: true, zip: true } },
        vehicle: { select: { year: true, make: true, model: true, trim: true, vin: true, licensePlate: true, mileageLastSeen: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
        organization: { select: { name: true, phone: true, email: true, logoUrl: true, addressLine1: true, city: true, state: true, zip: true, invoiceTerms: true, taxLabel: true } },
        createdBy: { select: { fullName: true } },
      },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portalUrl = `${appUrl}/portal/estimates/${id}`;

    const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const categories = [...new Set(estimate.lineItems.map(li => li.category).filter(Boolean))];

    // Group line items by category
    const grouped: Record<string, typeof estimate.lineItems> = {};
    for (const li of estimate.lineItems) {
      const cat = li.category ?? "Services";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(li);
    }

    const lineItemsHtml = Object.entries(grouped).map(([cat, items]) => `
      <tr><td colspan="4" style="padding:10px 0 4px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;">${cat}</td></tr>
      ${items.map(li => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#1e293b;">
            ${li.description}
            ${li.laborHours ? `<span style="color:#64748b;font-size:11px;"> — ${Number(li.laborHours).toFixed(1)}h</span>` : ""}
            ${li.warranty ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">Warranty: ${li.warranty}</div>` : ""}
          </td>
          <td style="padding:8px 12px;font-size:13px;color:#475569;text-align:right;">${Number(li.quantity).toFixed(li.quantity === Math.floor(Number(li.quantity)) ? 0 : 2)}</td>
          <td style="padding:8px 12px;font-size:13px;color:#475569;text-align:right;">${fmt(li.unitPriceCents)}</td>
          <td style="padding:8px 0;font-size:13px;font-weight:500;color:#1e293b;text-align:right;">${fmt(li.totalCents)}</td>
        </tr>
      `).join("")}
    `).join("");

    const vehicleStr = estimate.vehicle
      ? `${estimate.vehicle.year ?? ""} ${estimate.vehicle.make ?? ""} ${estimate.vehicle.model ?? ""} ${estimate.vehicle.trim ?? ""}`.trim()
      : null;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Estimate ${estimate.estimateNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; padding: 40px; font-size: 13px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <!-- Header -->
  <table width="100%" style="margin-bottom:32px;">
    <tr>
      <td>
        <p style="font-size:22px;font-weight:700;color:#1e293b;">${estimate.organization.name}</p>
        ${estimate.organization.addressLine1 ? `<p style="color:#64748b;font-size:12px;">${estimate.organization.addressLine1}, ${estimate.organization.city}, ${estimate.organization.state} ${estimate.organization.zip}</p>` : ""}
        ${estimate.organization.phone ? `<p style="color:#64748b;font-size:12px;">${estimate.organization.phone}</p>` : ""}
        ${estimate.organization.email ? `<p style="color:#64748b;font-size:12px;">${estimate.organization.email}</p>` : ""}
      </td>
      <td style="text-align:right;">
        <p style="font-size:24px;font-weight:700;color:#3b82f6;">ESTIMATE</p>
        <p style="font-size:18px;font-weight:600;color:#1e293b;">${estimate.estimateNumber}</p>
        <p style="color:#64748b;font-size:12px;">Date: ${new Date(estimate.createdAt).toLocaleDateString("en-US")}</p>
        ${estimate.expiresAt ? `<p style="color:#ef4444;font-size:12px;">Expires: ${new Date(estimate.expiresAt).toLocaleDateString("en-US")}</p>` : ""}
      </td>
    </tr>
  </table>

  <!-- Customer & Vehicle -->
  <table width="100%" style="margin-bottom:24px;">
    <tr>
      <td width="50%" style="padding-right:20px;">
        <p style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Customer</p>
        <p style="font-weight:600;">${estimate.customer.firstName} ${estimate.customer.lastName}</p>
        ${estimate.customer.phonePrimary ? `<p style="color:#475569;">${estimate.customer.phonePrimary}</p>` : ""}
        ${estimate.customer.email ? `<p style="color:#475569;">${estimate.customer.email}</p>` : ""}
      </td>
      ${vehicleStr ? `
      <td width="50%">
        <p style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Vehicle</p>
        <p style="font-weight:600;">${vehicleStr}</p>
        ${estimate.vehicle?.licensePlate ? `<p style="color:#475569;">Plate: ${estimate.vehicle.licensePlate}</p>` : ""}
        ${estimate.vehicle?.vin ? `<p style="color:#475569;font-size:11px;">VIN: ${estimate.vehicle.vin}</p>` : ""}
        ${estimate.vehicle?.mileageLastSeen ? `<p style="color:#475569;">Mileage: ${estimate.vehicle.mileageLastSeen.toLocaleString()}</p>` : ""}
      </td>` : "<td></td>"}
    </tr>
  </table>

  <!-- Service title -->
  <p style="font-size:16px;font-weight:600;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #3b82f6;">${estimate.title}</p>

  <!-- Line items table -->
  <table width="100%" style="margin-bottom:24px;border-collapse:collapse;">
    <thead>
      <tr style="border-bottom:2px solid #e2e8f0;">
        <th style="padding:8px 0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:left;">Description</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Qty</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Unit Price</th>
        <th style="padding:8px 0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>

  <!-- Totals -->
  <table width="100%" style="margin-bottom:24px;">
    <tr>
      <td width="55%"></td>
      <td width="45%">
        <table width="100%" style="border-top:1px solid #e2e8f0;padding-top:12px;">
          <tr><td style="padding:4px 0;color:#475569;">Subtotal</td><td style="text-align:right;font-weight:500;">${fmt(estimate.subtotalCents)}</td></tr>
          ${estimate.discountCents > 0 ? `<tr><td style="padding:4px 0;color:#16a34a;">Discount</td><td style="text-align:right;color:#16a34a;">-${fmt(estimate.discountCents)}</td></tr>` : ""}
          ${estimate.taxCents > 0 ? `<tr><td style="padding:4px 0;color:#475569;">${estimate.organization.taxLabel ?? "Tax"}</td><td style="text-align:right;">${fmt(estimate.taxCents)}</td></tr>` : ""}
          ${estimate.depositCents > 0 ? `<tr><td style="padding:4px 0;color:#475569;">Deposit required</td><td style="text-align:right;">-${fmt(estimate.depositCents)}</td></tr>` : ""}
          <tr style="border-top:2px solid #1e293b;"><td style="padding:8px 0 0;font-size:16px;font-weight:700;">Total</td><td style="text-align:right;font-size:16px;font-weight:700;padding-top:8px;">${fmt(estimate.totalCents)}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  ${estimate.warrantyText ? `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
    <p style="font-size:10px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Warranty</p>
    <p style="color:#166534;font-size:13px;">${estimate.warrantyText}</p>
  </div>` : ""}

  ${estimate.notes ? `
  <div style="margin-bottom:16px;">
    <p style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Notes</p>
    <p style="color:#475569;">${estimate.notes}</p>
  </div>` : ""}

  ${estimate.organization.invoiceTerms ? `
  <div style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:16px;">
    <p style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Terms</p>
    <p style="color:#94a3b8;font-size:11px;">${estimate.organization.invoiceTerms}</p>
  </div>` : ""}

  <!-- Approval link -->
  <div style="margin-top:24px;text-align:center;padding:20px;background:#eff6ff;border-radius:8px;">
    <p style="color:#1e40af;font-size:13px;margin-bottom:8px;">Review and approve this estimate online:</p>
    <p style="font-weight:600;color:#3b82f6;font-size:12px;word-break:break-all;">${portalUrl}</p>
  </div>
</body>
</html>`;

    // Return HTML that can be printed to PDF by the browser
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Estimate-Number": estimate.estimateNumber,
      },
    });
  } catch (err) {
    console.error("GET /pdf:", err);
    return ApiErrors.internal();
  }
}
