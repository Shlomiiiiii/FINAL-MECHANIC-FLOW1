import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");
    const now     = new Date();
    const from    = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to      = toStr   ? new Date(toStr)   : now;
    const orgId   = user.organizationId;

    const [
      paidInvoices, pendingInvoices, overdueInvoices,
      completedJobs, totalJobs,
      totalCustomers, newCustomers,
      topCustomers,
    ] = await Promise.all([
      // Revenue collected this period
      prisma.invoice.aggregate({
        where: { organizationId: orgId, status: "PAID", paidAt: { gte: from, lte: to } },
        _sum: { totalCents: true },
        _count: true,
      }),
      // Outstanding balance
      prisma.invoice.aggregate({
        where: { organizationId: orgId, status: { in: ["SENT","VIEWED","PARTIALLY_PAID"] } },
        _sum: { balanceCents: true },
        _count: true,
      }),
      // Overdue
      prisma.invoice.aggregate({
        where: { organizationId: orgId, status: "OVERDUE" },
        _sum: { balanceCents: true },
        _count: true,
      }),
      // Completed jobs this period
      prisma.job.aggregate({
        where: { organizationId: orgId, status: { in: ["COMPLETED","INVOICED","CLOSED"] }, completedAt: { gte: from, lte: to }, deletedAt: null },
        _sum: { totalCents: true },
        _count: true,
        _avg: { totalCents: true },
      }),
      // Total jobs in period
      prisma.job.count({ where: { organizationId: orgId, createdAt: { gte: from, lte: to }, deletedAt: null } }),
      // Customers
      prisma.customer.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.customer.count({ where: { organizationId: orgId, createdAt: { gte: from, lte: to }, deletedAt: null } }),
      // Top customers by lifetime spend
      prisma.customer.findMany({
        where: { organizationId: orgId, deletedAt: null, lifetimeRevenueCents: { gt: 0 } },
        select: { id: true, firstName: true, lastName: true, lifetimeRevenueCents: true, totalJobCount: true },
        orderBy: { lifetimeRevenueCents: "desc" },
        take: 8,
      }),
    ]);

    // Revenue by month (last 6 months of paid invoices)
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentPaid = await prisma.invoice.findMany({
      where: { organizationId: orgId, status: "PAID", paidAt: { gte: sixMonthsAgo } },
      select: { totalCents: true, paidAt: true },
    });
    const monthlyMap: Record<string, number> = {};
    for (const inv of recentPaid) {
      const m = new Date(inv.paidAt!).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      monthlyMap[m] = (monthlyMap[m] ?? 0) + inv.totalCents;
    }

    // Invoice status breakdown in period
    const invoiceStatusBreakdown = await prisma.invoice.groupBy({
      by: ["status"],
      where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
      _count: true,
      _sum: { totalCents: true },
    });

    // Top job categories from line item descriptions
    const recentJobs = await prisma.job.findMany({
      where: { organizationId: orgId, completedAt: { gte: from, lte: to }, status: { in: ["COMPLETED","INVOICED","CLOSED"] }, deletedAt: null },
      select: { title: true, totalCents: true },
      take: 200,
    });
    const catMap: Record<string, number> = {};
    for (const j of recentJobs) {
      const cat = j.title?.split(" ")[0] ?? "Other";
      catMap[cat] = (catMap[cat] ?? 0) + j.totalCents;
    }
    const byCategory = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,8);

    return successResponse({
      period: { from, to },
      revenue: {
        collected:    paidInvoices._sum.totalCents ?? 0,
        outstanding:  pendingInvoices._sum.balanceCents ?? 0,
        overdue:      overdueInvoices._sum.balanceCents ?? 0,
        paidCount:    paidInvoices._count,
        pendingCount: pendingInvoices._count,
        overdueCount: overdueInvoices._count,
      },
      jobs: {
        completed:  completedJobs._count,
        total:      totalJobs,
        totalValue: completedJobs._sum.totalCents ?? 0,
        avgValue:   Math.round(completedJobs._avg.totalCents ?? 0),
      },
      customers: { total: totalCustomers, new: newCustomers },
      topCustomers,
      byCategory,
      monthlyTrend: Object.entries(monthlyMap),
      invoiceStatusBreakdown,
    });
  } catch (err) {
    console.error("GET /api/reports:", err);
    return ApiErrors.internal();
  }
}
