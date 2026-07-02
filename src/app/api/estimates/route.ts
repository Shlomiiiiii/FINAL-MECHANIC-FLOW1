import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";
import { generateEstimateNumber } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim() ?? "";
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "25"), 100);

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      ...(status ? { status } : {}),
    };

    if (search) {
      where.OR = [
        { estimateNumber: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { customer: { firstName: { contains: search, mode: "insensitive" } } },
        { customer: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [estimates, total] = await Promise.all([
      prisma.estimate.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true } },
          vehicle: { select: { id: true, year: true, make: true, model: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { lineItems: true, views: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.estimate.count({ where }),
    ]);

    const hasMore = estimates.length > limit;
    const data = hasMore ? estimates.slice(0, -1) : estimates;

    return successResponse({
      estimates: data,
      pagination: { cursor: hasMore ? data.at(-1)?.id ?? null : null, hasMore, total },
    });
  } catch (error) {
    console.error("GET /api/estimates:", error);
    return ApiErrors.internal();
  }
}

const createEstimateSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().optional(),
  jobId: z.string().optional(),
  title: z.string().min(1).max(300),
  notes: z.string().max(5000).optional(),
  internalNotes: z.string().max(5000).optional(),
  warrantyText: z.string().max(1000).optional(),
  expiresAt: z.string().optional(),
  depositCents: z.number().int().min(0).optional(),
  depositNote: z.string().max(500).optional(),
  lineItems: z.array(z.object({
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
  })).optional().default([]),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();

    const body = await request.json();
    const parsed = createEstimateSchema.safeParse(body);
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

    // Get org for tax rate + counter
    const org = await prisma.organization.update({
      where: { id: user.organizationId },
      data: { estimateCounter: { increment: 1 } },
      select: { estimateCounter: true, taxRatePct: true },
    });

    const estimateNumber = generateEstimateNumber(org.estimateCounter);
    const taxRate = Number(org.taxRatePct);

    // Compute financials
    let subtotal = 0, taxTotal = 0;
    for (const li of data.lineItems) {
      const lineTotal = Math.round(li.unitPriceCents * li.quantity);
      subtotal += lineTotal;
      if (li.taxable && li.itemType !== "DISCOUNT") {
        taxTotal += Math.round(lineTotal * taxRate);
      }
    }
    const total = subtotal + taxTotal - (data.depositCents ?? 0);

    const estimate = await prisma.estimate.create({
      data: {
        organizationId: user.organizationId,
        customerId: data.customerId,
        vehicleId: data.vehicleId || undefined,
        jobId: data.jobId || undefined,
        estimateNumber,
        title: data.title,
        notes: data.notes,
        internalNotes: data.internalNotes,
        warrantyText: data.warrantyText,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        depositCents: data.depositCents ?? 0,
        depositNote: data.depositNote,
        subtotalCents: subtotal,
        taxCents: taxTotal,
        totalCents: total,
        createdById: user.id,
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
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true } },
        vehicle: { select: { year: true, make: true, model: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "CREATED",
        resourceType: "estimate",
        resourceId: estimate.id,
      },
    });

    return successResponse({ estimate }, 201);
  } catch (error) {
    console.error("POST /api/estimates:", error);
    return ApiErrors.internal();
  }
}
