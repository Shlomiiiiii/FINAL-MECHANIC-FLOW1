import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  name:          z.string().min(1).max(200),
  partNumber:    z.string().max(100).optional(),
  sku:           z.string().max(100).optional(),
  barcode:       z.string().max(100).optional(),
  category:      z.string().max(100).optional(),
  description:   z.string().max(2000).optional(),
  manufacturer:  z.string().max(200).optional(),
  brand:         z.string().max(200).optional(),
  vendorId:      z.string().optional(),
  location:      z.string().max(100).optional(),
  unitOfMeasure: z.string().max(30).optional().default("each"),
  unitCostCents: z.number().int().min(0).optional().default(0),
  sellPriceCents:z.number().int().min(0).optional().default(0),
  taxable:       z.boolean().optional().default(true),
  quantityOnHand:z.number().min(0).optional().default(0),
  reorderPoint:  z.number().min(0).optional(),
  reorderQuantity:z.number().min(0).optional(),
  maxStock:      z.number().min(0).optional(),
  warrantyMonths:z.number().int().min(0).optional(),
  notes:         z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const search    = searchParams.get("search")?.trim() ?? "";
    const category  = searchParams.get("category");
    const lowStock  = searchParams.get("lowStock") === "true";
    const cursor    = searchParams.get("cursor");
    const limit     = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    const where: any = { organizationId: user.organizationId, isActive: true };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name:        { contains: search, mode: "insensitive" } },
        { partNumber:  { contains: search, mode: "insensitive" } },
        { sku:         { contains: search, mode: "insensitive" } },
        { barcode:     { contains: search, mode: "insensitive" } },
        { manufacturer:{ contains: search, mode: "insensitive" } },
      ];
    }
    if (lowStock) {
      where.AND = [
        { reorderPoint: { not: null } },
        // Can't compare Decimal fields directly in prisma where without raw — filter in JS
      ];
    }

    const [items, total, categories] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { name: "asc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where: { organizationId: user.organizationId, isActive: true, category: { not: null } },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      }),
    ]);

    // Apply low-stock filter in JS (Decimal comparison)
    let filtered = items;
    if (lowStock) {
      filtered = items.filter(i => i.reorderPoint !== null && Number(i.quantityOnHand) <= Number(i.reorderPoint));
    }

    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, -1) : filtered;

    // Compute dashboard stats
    const totalValue = data.reduce((s, i) => s + Number(i.quantityOnHand) * i.unitCostCents, 0);
    const lowStockCount = data.filter(i => i.reorderPoint && Number(i.quantityOnHand) <= Number(i.reorderPoint)).length;
    const outOfStockCount = data.filter(i => Number(i.quantityOnHand) === 0).length;

    return successResponse({
      items: data.map(i => ({ ...i, quantityOnHand: Number(i.quantityOnHand), quantityReserved: Number(i.quantityReserved), reorderPoint: i.reorderPoint ? Number(i.reorderPoint) : null, reorderQuantity: i.reorderQuantity ? Number(i.reorderQuantity) : null, maxStock: i.maxStock ? Number(i.maxStock) : null, markupPct: i.markupPct ? Number(i.markupPct) : null, totalUsedQty: Number(i.totalUsedQty) })),
      pagination: { hasMore, cursor: hasMore ? data.at(-1)?.id ?? null : null, total },
      stats: { totalValue, lowStockCount, outOfStockCount },
      categories: categories.map(c => c.category).filter(Boolean),
    });
  } catch (err) {
    console.error("GET /api/inventory:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
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
    const item = await prisma.inventoryItem.create({
      data: {
        organizationId: user.organizationId,
        name:           data.name,
        partNumber:     data.partNumber,
        sku:            data.sku,
        barcode:        data.barcode,
        category:       data.category,
        description:    data.description,
        manufacturer:   data.manufacturer,
        brand:          data.brand,
        vendorId:       data.vendorId || undefined,
        location:       data.location,
        unitOfMeasure:  data.unitOfMeasure ?? "each",
        unitCostCents:  data.unitCostCents ?? 0,
        sellPriceCents: data.sellPriceCents ?? 0,
        taxable:        data.taxable ?? true,
        quantityOnHand: data.quantityOnHand ?? 0,
        reorderPoint:   data.reorderPoint,
        reorderQuantity:data.reorderQuantity,
        maxStock:       data.maxStock,
        warrantyMonths: data.warrantyMonths,
        notes:          data.notes,
      },
    });

    // Log initial stock if > 0
    if ((data.quantityOnHand ?? 0) > 0) {
      await prisma.inventoryAdjustment.create({
        data: {
          organizationId:  user.organizationId,
          inventoryItemId: item.id,
          adjustmentType:  "ADD",
          quantityDelta:   data.quantityOnHand ?? 0,
          quantityBefore:  0,
          quantityAfter:   data.quantityOnHand ?? 0,
          unitCostCents:   data.unitCostCents ?? 0,
          totalCostCents:  Math.round((data.quantityOnHand ?? 0) * (data.unitCostCents ?? 0)),
          notes:           "Initial stock",
          createdById:     user.id,
        },
      });
    }

    return successResponse({ item }, 201);
  } catch (err) {
    console.error("POST /api/inventory:", err);
    return ApiErrors.internal();
  }
}
