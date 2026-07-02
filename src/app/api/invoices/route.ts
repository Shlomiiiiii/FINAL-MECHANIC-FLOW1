import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { createInvoiceSchema } from "@/lib/validations/invoice";
import {
  computeTotals, getNextInvoiceNumber,
  buildLineItemCreateData, logInvoiceEvent,
} from "@/lib/invoice-utils";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const search   = searchParams.get("search")?.trim() ?? "";
    const status   = searchParams.get("status");
    const cursor   = searchParams.get("cursor");
    const limit    = Math.min(parseInt(searchParams.get("limit") ?? "25"), 100);
    const from     = searchParams.get("from");
    const to       = searchParams.get("to");

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      ...(status ? { status } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    };

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { customer: { firstName: { contains: search, mode: "insensitive" } } },
        { customer: { lastName:  { contains: search, mode: "insensitive" } } },
        { customer: { email:     { contains: search, mode: "insensitive" } } },
        { customer: { phonePrimary: { contains: search, mode: "insensitive" } } },
        { vehicle: { vin:          { contains: search, mode: "insensitive" } } },
        { vehicle: { licensePlate: { contains: search, mode: "insensitive" } } },
        { poNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true } },
          vehicle:  { select: { id: true, year: true, make: true, model: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count:   { select: { payments: true, views: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.invoice.count({ where }),
    ]);

    const hasMore = invoices.length > limit;
    const data    = hasMore ? invoices.slice(0, -1) : invoices;

    return successResponse({
      invoices: data,
      pagination: { cursor: hasMore ? data.at(-1)?.id ?? null : null, hasMore, total },
    });
  } catch (err) {
    console.error("GET /api/invoices:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = createInvoiceSchema.safeParse(body);
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

    // Get org tax rate + next invoice number
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { taxRatePct: true, invoiceTerms: true },
    });

    const { invoiceNumber } = await getNextInvoiceNumber(user.organizationId);
    const taxRate = Number(org?.taxRatePct ?? 0);
    const totals  = computeTotals(data.lineItems, taxRate, 0, data.depositCents);

    // Default due date: 30 days
    const dueDate = data.dueDate
      ? new Date(data.dueDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          organizationId: user.organizationId,
          customerId:   data.customerId,
          vehicleId:    data.vehicleId || undefined,
          jobId:        data.jobId     || undefined,
          estimateId:   data.estimateId || undefined,
          invoiceNumber,
          invoiceType:  data.invoiceType,
          status:       "DRAFT",
          notes:        data.notes,
          terms:        data.terms ?? org?.invoiceTerms ?? undefined,
          warrantyText: data.warrantyText,
          poNumber:     data.poNumber,
          dueDate,
          depositCents: data.depositCents ?? 0,
          isRecurring:  data.isRecurring ?? false,
          recurringInterval: data.isRecurring ? data.recurringInterval : undefined,
          recurringEndDate:  data.isRecurring && data.recurringEndDate
            ? new Date(data.recurringEndDate) : undefined,
          subtotalCents:  totals.subtotalCents,
          taxCents:       totals.taxCents,
          discountCents:  totals.discountCents,
          totalCents:     totals.totalCents,
          amountPaidCents: 0,
          balanceCents:   totals.totalCents,
          createdById:    user.id,
          lineItems: {
            createMany: { data: buildLineItemCreateData(data.lineItems, user.organizationId) },
          },
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          vehicle:  { select: { year: true, make: true, model: true } },
          lineItems: { orderBy: { sortOrder: "asc" } },
        },
      });

      // Timeline event
      await tx.invoiceEvent.create({
        data: { invoiceId: inv.id, userId: user.id, eventType: "created",
          note: `Invoice ${invoiceNumber} created` },
      });

      // Audit log
      await tx.auditLog.create({
        data: { organizationId: user.organizationId, userId: user.id,
          action: "CREATED", resourceType: "invoice", resourceId: inv.id },
      });

      return inv;
    });

    return successResponse({ invoice }, 201);
  } catch (err) {
    console.error("POST /api/invoices:", err);
    return ApiErrors.internal();
  }
}
