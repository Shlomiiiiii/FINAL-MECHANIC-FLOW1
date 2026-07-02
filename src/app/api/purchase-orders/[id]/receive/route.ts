import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { lineItems: { include: { item: true } } },
    });
    if (!po) return ApiErrors.notFound("Purchase order");
    if (po.status === "RECEIVED") return ApiErrors.businessLogic("Already received.");

    const body = await request.json().catch(() => ({}));
    const received = body.lineItems as Array<{ id: string; receivedQty: number }> | undefined;

    await prisma.$transaction(async (tx) => {
      for (const li of po.lineItems) {
        const qty = received?.find(r => r.id === li.id)?.receivedQty ?? Number(li.quantity);
        if (qty <= 0) continue;
        const before = Number(li.item.quantityOnHand);
        const after  = before + qty;
        await tx.inventoryItem.update({
          where: { id: li.inventoryItemId },
          data: { quantityOnHand: after, unitCostCents: li.unitCostCents },
        });
        await tx.inventoryAdjustment.create({
          data: {
            organizationId:  user.organizationId,
            inventoryItemId: li.inventoryItemId,
            adjustmentType:  "PO_RECEIVE",
            quantityDelta:   qty,
            quantityBefore:  before,
            quantityAfter:   after,
            unitCostCents:   li.unitCostCents,
            totalCostCents:  Math.round(qty * li.unitCostCents),
            purchaseOrderId: id,
            notes:           `Received on ${po.poNumber}`,
            createdById:     user.id,
          },
        });
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: "RECEIVED", receivedAt: new Date() },
      });

      // Update vendor spend stats
      await tx.vendor.update({
        where: { id: po.vendorId },
        data: { totalSpentCents: { increment: po.totalCents }, totalOrders: { increment: 1 } },
      });
    });

    return successResponse({ received: true });
  } catch (err) { console.error("POST /receive:", err); return ApiErrors.internal(); }
}
