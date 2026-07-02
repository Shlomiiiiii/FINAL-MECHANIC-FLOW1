import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { customerUpdateSchema } from "@/lib/validations/customer";
import { successResponse, ApiErrors } from "@/lib/api-response";

async function getCustomerOrFail(id: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!customer) return null;
  return customer;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        vehicles: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
        jobs: {
          where: { deletedAt: null },
          include: {
            assignments: {
              include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
              where: { isLead: true },
              take: 1,
            },
            vehicle: { select: { year: true, make: true, model: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        estimates: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { vehicle: { select: { year: true, make: true, model: true } } },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        appointments: {
          orderBy: { startsAt: "desc" },
          take: 5,
        },
        communicationLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (!customer) return ApiErrors.notFound("Customer");

    // Calculate metrics
    const [metrics, outstandingInvoices] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          customerId: id,
          organizationId: user.organizationId,
          status: "SUCCEEDED",
        },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.invoice.findMany({
        where: {
          customerId: id,
          organizationId: user.organizationId,
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
        select: { balanceCents: true, status: true },
      }),
    ]);

    const outstandingBalance = outstandingInvoices.reduce(
      (sum, inv) => sum + inv.balanceCents,
      0
    );

    const avgInvoice =
      customer.invoices.length > 0
        ? Math.round(
            customer.invoices.reduce((s, i) => s + i.totalCents, 0) /
              customer.invoices.length
          )
        : 0;

    return successResponse({
      customer: {
        ...customer,
        metrics: {
          lifetimeRevenueCents: metrics._sum.amountCents ?? 0,
          outstandingBalanceCents: outstandingBalance,
          totalJobCount: customer.jobs.length,
          totalInvoiceCount: customer.invoices.length,
          averageInvoiceCents: avgInvoice,
          paymentCount: metrics._count,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/customers/[id]:", error);
    return ApiErrors.internal();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const existing = await getCustomerOrFail(id, user.organizationId);
    if (!existing) return ApiErrors.notFound("Customer");

    const body = await request.json();
    const parsed = customerUpdateSchema.safeParse(body);

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

    // Duplicate check on email/phone change
    if (data.email && data.email !== existing.email) {
      const dup = await prisma.customer.findFirst({
        where: {
          organizationId: user.organizationId,
          email: data.email,
          deletedAt: null,
          NOT: { id },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (dup)
        return ApiErrors.conflict(
          `Email already used by ${dup.firstName} ${dup.lastName}.`
        );
    }

    // Build change diff for audit
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [key, newVal] of Object.entries(data)) {
      const oldVal = (existing as Record<string, unknown>)[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = [oldVal, newVal];
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags ?? existing.tags,
      },
      include: {
        vehicles: { where: { deletedAt: null } },
        _count: { select: { jobs: true, invoices: true } },
      },
    });

    // Audit
    if (Object.keys(changes).length > 0) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "UPDATED",
          resourceType: "customer",
          resourceId: id,
          changes,
        },
      });
    }

    return successResponse({ customer: updated });
  } catch (error) {
    console.error("PATCH /api/customers/[id]:", error);
    return ApiErrors.internal();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    if (!["OWNER", "MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const { id } = await params;
    const existing = await getCustomerOrFail(id, user.organizationId);
    if (!existing) return ApiErrors.notFound("Customer");

    // Soft delete
    await prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "DELETED",
        resourceType: "customer",
        resourceId: id,
      },
    });

    return successResponse({ success: true });
  } catch (error) {
    console.error("DELETE /api/customers/[id]:", error);
    return ApiErrors.internal();
  }
}
