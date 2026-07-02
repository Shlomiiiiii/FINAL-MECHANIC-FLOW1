import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const poSchema = z.object({
  vendorId:      z.string().min(1),
  expectedAt:    z.string().optional(),
  notes:         z.string().max(2000).optional(),
  shippingCents: z.number().int().min(0).optional().default(0),
  lineItems:     z.array(z.object({
    inventoryItemId: z.string().min(1),
    quantity:        z.number().min(0.01),
    unitCostCents:   z.number().int().min(0),
    notes:           z.string().optional(),
  })).min(1, "At least one item required"),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const where: any = { organizationId: user.organizationId };
    if (status) where.status = status;
    const pos = await prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        lineItems: { include: { item: { select: { id: true, name: true, partNumber: true } } } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return successResponse({ purchaseOrders: pos });
  } catch (err) { return ApiErrors.internal(); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();
    const body = await request.json();
    const parsed = poSchema.safeParse(body);
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

    // Generate PO number
    const count = await prisma.purchaseOrder.count({ where: { organizationId: user.organizationId } });
    const poNumber = `PO-${String(count + 1001).padStart(4, "0")}`;

    const subtotal = data.lineItems.reduce((s, li) => s + li.quantity * li.unitCostCents, 0);
    const total    = subtotal + (data.shippingCents ?? 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        organizationId: user.organizationId,
        vendorId:       data.vendorId,
        poNumber,
        status:         "DRAFT",
        subtotalCents:  Math.round(subtotal),
        shippingCents:  data.shippingCents ?? 0,
        totalCents:     Math.round(total),
        expectedAt:     data.expectedAt ? new Date(data.expectedAt) : undefined,
        notes:          data.notes,
        createdById:    user.id,
        lineItems: {
          create: data.lineItems.map(li => ({
            inventoryItemId: li.inventoryItemId,
            quantity:        li.quantity,
            unitCostCents:   li.unitCostCents,
            totalCents:      Math.round(li.quantity * li.unitCostCents),
            notes:           li.notes,
          })),
        },
      },
      include: {
        vendor: { select: { name: true } },
        lineItems: { include: { item: { select: { name: true } } } },
      },
    });
    return successResponse({ purchaseOrder: po }, 201);
  } catch (err) { console.error("POST /purchase-orders:", err); return ApiErrors.internal(); }
}
