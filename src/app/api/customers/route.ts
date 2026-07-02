import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { customerSchema } from "@/lib/validations/customer";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "25"), 100);
    const tag = searchParams.get("tag");
    const source = searchParams.get("source");
    const hasBalance = searchParams.get("hasBalance") === "true";
    const isCommercial = searchParams.get("isCommercial");
    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phonePrimary: { contains: search, mode: "insensitive" } },
        { phoneSecondary: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { addressLine1: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    if (tag) where.tags = { has: tag };
    if (source) where.source = source;
    if (isCommercial !== null && isCommercial !== undefined && isCommercial !== "") {
      where.isCommercial = isCommercial === "true";
    }
    if (hasBalance) where.lifetimeRevenueCents = { gt: 0 };

    const validSortFields: Record<string, string> = {
      createdAt: "createdAt",
      lastName: "lastName",
      lifetimeRevenueCents: "lifetimeRevenueCents",
      totalJobCount: "totalJobCount",
      lastServiceAt: "lastServiceAt",
    };
    const orderBy = {
      [validSortFields[sortBy] ?? "createdAt"]: sortDir,
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          vehicles: {
            where: { deletedAt: null },
            select: { id: true, year: true, make: true, model: true, licensePlate: true },
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              jobs: { where: { deletedAt: null } },
              invoices: true,
            },
          },
        },
        orderBy,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.customer.count({ where }),
    ]);

    const hasMore = customers.length > limit;
    const data = hasMore ? customers.slice(0, -1) : customers;

    // Calculate outstanding balance for each customer
    const customerIds = data.map((c) => c.id);
    const balances = await prisma.invoice.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _sum: { balanceCents: true },
    });
    const balanceMap = new Map(
      balances.map((b) => [b.customerId, b._sum.balanceCents ?? 0])
    );

    const enriched = data.map((c) => ({
      ...c,
      outstandingBalanceCents: balanceMap.get(c.id) ?? 0,
    }));

    return successResponse({
      customers: enriched,
      pagination: {
        cursor: hasMore ? data[data.length - 1]?.id ?? null : null,
        hasMore,
        total,
      },
    });
  } catch (error) {
    console.error("GET /api/customers:", error);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body = await request.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;

    // Duplicate detection — same org, same email or same phone
    if (data.email || data.phonePrimary) {
      const orClauses = [];
      if (data.email) orClauses.push({ email: data.email });
      if (data.phonePrimary) orClauses.push({ phonePrimary: data.phonePrimary });

      const existing = await prisma.customer.findFirst({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          OR: orClauses,
        },
        select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true },
      });

      if (existing) {
        return ApiErrors.conflict(
          `A customer with this ${existing.email === data.email ? "email" : "phone number"} already exists: ${existing.firstName} ${existing.lastName}.`
        );
      }
    }

    const customer = await prisma.customer.create({
      data: {
        organizationId: user.organizationId,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        isCommercial: data.isCommercial ?? false,
        email: data.email,
        phonePrimary: data.phonePrimary,
        phoneSecondary: data.phoneSecondary,
        preferredContact: data.preferredContact ?? "phone",
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        zip: data.zip,
        tags: data.tags ?? [],
        source: data.source,
        notes: data.notes,
        doNotContact: data.doNotContact ?? false,
      },
      include: {
        vehicles: true,
        _count: { select: { jobs: true, invoices: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "CREATED",
        resourceType: "customer",
        resourceId: customer.id,
      },
    });

    return successResponse({ customer }, 201);
  } catch (error) {
    console.error("POST /api/customers:", error);
    return ApiErrors.internal();
  }
}
