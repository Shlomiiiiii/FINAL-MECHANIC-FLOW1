import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { updateInvoiceSchema } from "@/lib/validations/invoice";
import { computeTotals, buildLineItemCreateData, logInvoiceEvent } from "@/lib/invoice-utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true, portalToken: true, addressLine1: true, city: true, state: true, zip: true } },
        vehicle:  { select: { id: true, year: true, make: true, model: true, trim: true, vin: true, licensePlate: true, mileageLastSeen: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { fullName: true } } } },
        createdBy: { select: { id: true, fullName: true } },
        views:     { orderBy: { viewedAt: "desc" }, take: 10 },
        events:    { orderBy: { createdAt: "desc" }, take: 30 },
        job:       { select: { id: true, jobNumber: true, status: true, title: true } },
        organization: {
          select: { name: true, phone: true, email: true, logoUrl: true,
            addressLine1: true, city: true, state: true, zip: true,
            invoiceTerms: true, taxLabel: true, currency: true },
        },
      },
    });

    if (!invoice) return ApiErrors.notFound("Invoice");
    return successResponse({ invoice });
  } catch (err) {
    console.error("GET /api/invoices/[id]:", err);
    return ApiErrors.internal();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, amountPaidCents: true },
    });
    if (!existing) return ApiErrors.notFound("Invoice");
    if (["PAID","CANCELLED"].includes(existing.status)) {
      return ApiErrors.businessLogic("Cannot edit a paid or cancelled invoice.");
    }

    const body   = await request.json();
    const parsed = updateInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;
    let totalsUpdate: Record<string, number> = {};

    if (data.lineItems !== undefined) {
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { taxRatePct: true },
      });
      const taxRate = Number(org?.taxRatePct ?? 0);
      const totals  = computeTotals(data.lineItems, taxRate, existing.amountPaidCents, data.depositCents ?? 0);
      totalsUpdate  = { ...totals };
      await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...(data.notes      !== undefined ? { notes:      data.notes      } : {}),
        ...(data.terms      !== undefined ? { terms:      data.terms      } : {}),
        ...(data.warrantyText !== undefined ? { warrantyText: data.warrantyText } : {}),
        ...(data.poNumber   !== undefined ? { poNumber:   data.poNumber   } : {}),
        ...(data.dueDate    !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.depositCents !== undefined ? { depositCents: data.depositCents } : {}),
        ...totalsUpdate,
        ...(data.lineItems !== undefined ? {
          lineItems: { createMany: { data: buildLineItemCreateData(data.lineItems, user.organizationId) } },
        } : {}),
      },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        customer:  { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await logInvoiceEvent(id, "updated", { userId: user.id });

    return successResponse({ invoice: updated });
  } catch (err) {
    console.error("PATCH /api/invoices/[id]:", err);
    return ApiErrors.internal();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, amountPaidCents: true },
    });
    if (!existing) return ApiErrors.notFound("Invoice");
    if (existing.amountPaidCents > 0) {
      return ApiErrors.businessLogic("Cannot delete an invoice with recorded payments. Cancel it instead.");
    }
    if (existing.status === "PAID") {
      return ApiErrors.businessLogic("Cannot delete a paid invoice.");
    }

    await prisma.invoice.delete({ where: { id } });
    return successResponse({ success: true });
  } catch (err) {
    console.error("DELETE /api/invoices/[id]:", err);
    return ApiErrors.internal();
  }
}
