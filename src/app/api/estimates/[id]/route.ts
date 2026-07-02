import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

async function getEstimate(id: string, organizationId: string) {
  return prisma.estimate.findFirst({
    where: { id, organizationId },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true, portalToken: true } },
      vehicle: { select: { id: true, year: true, make: true, model: true, trim: true, vin: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { id: true, fullName: true } },
      views: { orderBy: { viewedAt: "desc" }, take: 20 },
      job: { select: { id: true, jobNumber: true, status: true } },
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;
    const estimate = await getEstimate(id, user.organizationId);
    if (!estimate) return ApiErrors.notFound("Estimate");
    return successResponse({ estimate });
  } catch (err) {
    console.error("GET /api/estimates/[id]:", err);
    return ApiErrors.internal();
  }
}

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  notes: z.string().max(5000).optional(),
  internalNotes: z.string().max(5000).optional(),
  warrantyText: z.string().max(1000).optional(),
  expiresAt: z.string().nullable().optional(),
  depositCents: z.number().int().min(0).optional(),
  depositNote: z.string().max(500).optional(),
  lineItems: z.array(z.object({
    id: z.string().optional(),
    itemType: z.enum(["LABOR", "PART", "FEE", "DISCOUNT"]),
    inventoryItemId: z.string().optional(),
    description: z.string().min(1).max(500),
    quantity: z.number().min(0.01),
    unitCostCents: z.number().int().optional(),
    unitPriceCents: z.number().int(),
    taxable: z.boolean().optional().default(true),
    category: z.string().optional(),
    warranty: z.string().optional(),
    laborHours: z.number().optional(),
    technicianId: z.string().optional(),
  })).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!existing) return ApiErrors.notFound("Estimate");
    if (["APPROVED", "CONVERTED"].includes(existing.status)) {
      return ApiErrors.businessLogic("Cannot edit an approved or converted estimate.");
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
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

    // Recompute financials if line items provided
    let subtotalCents: number | undefined;
    let taxCents: number | undefined;
    let totalCents: number | undefined;

    if (data.lineItems !== undefined) {
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { taxRatePct: true },
      });
      const taxRate = Number(org?.taxRatePct ?? 0);
      let sub = 0, tax = 0;
      for (const li of data.lineItems) {
        const lineTotal = Math.round(li.unitPriceCents * li.quantity);
        sub += lineTotal;
        if (li.taxable && li.itemType !== "DISCOUNT") tax += Math.round(lineTotal * taxRate);
      }
      subtotalCents = sub;
      taxCents = tax;
      totalCents = sub + tax - (data.depositCents ?? 0);

      // Delete all existing line items then recreate
      await prisma.estimateLineItem.deleteMany({ where: { estimateId: id } });
    }

    const updated = await prisma.estimate.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.internalNotes !== undefined ? { internalNotes: data.internalNotes } : {}),
        ...(data.warrantyText !== undefined ? { warrantyText: data.warrantyText } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
        ...(data.depositCents !== undefined ? { depositCents: data.depositCents } : {}),
        ...(data.depositNote !== undefined ? { depositNote: data.depositNote } : {}),
        ...(subtotalCents !== undefined ? { subtotalCents, taxCents, totalCents } : {}),
        ...(data.lineItems !== undefined ? {
          lineItems: {
            create: data.lineItems.map((li, idx) => ({
              organizationId: user.organizationId,
              itemType: li.itemType,
              inventoryItemId: li.inventoryItemId || undefined,
              description: li.description,
              quantity: li.quantity,
              unitCostCents: li.unitCostCents ?? 0,
              unitPriceCents: li.unitPriceCents,
              totalCents: Math.round(li.unitPriceCents * li.quantity),
              taxable: li.taxable ?? true,
              category: li.category,
              warranty: li.warranty,
              laborHours: li.laborHours,
              technicianId: li.technicianId,
              sortOrder: idx,
            })),
          },
        } : {}),
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        vehicle: { select: { year: true, make: true, model: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    return successResponse({ estimate: updated });
  } catch (err) {
    console.error("PATCH /api/estimates/[id]:", err);
    return ApiErrors.internal();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER", "MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await prisma.estimate.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!existing) return ApiErrors.notFound("Estimate");
    if (existing.status === "APPROVED") {
      return ApiErrors.businessLogic("Cannot delete an approved estimate.");
    }

    await prisma.estimate.delete({ where: { id } });
    return successResponse({ success: true });
  } catch (err) {
    console.error("DELETE /api/estimates/[id]:", err);
    return ApiErrors.internal();
  }
}
