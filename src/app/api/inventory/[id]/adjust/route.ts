import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const adjustSchema = z.object({
  adjustmentType: z.enum(["ADD","REMOVE","CORRECTION","WRITE_OFF"]),
  quantity:       z.number().min(0.01),
  unitCostCents:  z.number().int().min(0).optional(),
  notes:          z.string().max(500).optional(),
  jobId:          z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const body = await request.json();
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) return ApiErrors.validation({});

    const item = await prisma.inventoryItem.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!item) return ApiErrors.notFound("Item");

    const before = Number(item.quantityOnHand);
    const delta  = ["REMOVE","WRITE_OFF"].includes(parsed.data.adjustmentType) ? -parsed.data.quantity : parsed.data.quantity;
    const after  = Math.max(0, before + delta);

    await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id }, data: { quantityOnHand: after } }),
      prisma.inventoryAdjustment.create({
        data: {
          organizationId:  user.organizationId,
          inventoryItemId: id,
          adjustmentType:  parsed.data.adjustmentType as any,
          quantityDelta:   delta,
          quantityBefore:  before,
          quantityAfter:   after,
          unitCostCents:   parsed.data.unitCostCents ?? item.unitCostCents,
          totalCostCents:  Math.round(Math.abs(delta) * (parsed.data.unitCostCents ?? item.unitCostCents)),
          notes:           parsed.data.notes,
          jobId:           parsed.data.jobId,
          createdById:     user.id,
        },
      }),
    ]);

    return successResponse({ before, after, delta });
  } catch (err) { console.error("POST /adjust:", err); return ApiErrors.internal(); }
}
