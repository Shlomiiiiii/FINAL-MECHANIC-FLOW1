import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await prisma.inventoryItem.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) return ApiErrors.notFound("Item");

    const body = await request.json();
    const allowed = ["name","partNumber","sku","barcode","category","description","manufacturer","brand",
      "vendorId","location","unitOfMeasure","unitCostCents","sellPriceCents","taxable",
      "reorderPoint","reorderQuantity","maxStock","warrantyMonths","warrantyNotes","notes","isActive","primaryImageUrl"];
    const updateData: Record<string, any> = {};
    for (const key of allowed) { if (key in body) updateData[key] = body[key]; }

    const updated = await prisma.inventoryItem.update({ where: { id }, data: updateData });
    return successResponse({ item: { ...updated, quantityOnHand: Number(updated.quantityOnHand), quantityReserved: Number(updated.quantityReserved) } });
  } catch (err) { console.error("PATCH /api/inventory/[id]:", err); return ApiErrors.internal(); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;
    await prisma.inventoryItem.update({ where: { id }, data: { isActive: false } });
    return successResponse({ success: true });
  } catch (err) { return ApiErrors.internal(); }
}
