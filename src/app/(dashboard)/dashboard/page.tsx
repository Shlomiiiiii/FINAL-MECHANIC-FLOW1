import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { DashboardKPIs } from "@/components/dashboard/kpis";
import { DashboardRecentJobs } from "@/components/dashboard/recent-jobs";
import { DashboardAlerts } from "@/components/dashboard/alerts";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

async function getDashboardData(organizationId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    openJobsCount,
    inProgressCount,
    pendingEstimatesCount,
    overdueInvoices,
    revenueToday,
    recentJobs,
  ] = await Promise.all([
    prisma.job.count({
      where: {
        organizationId,
        status: { in: ["LEAD", "SCHEDULED", "IN_PROGRESS", "PENDING_REVIEW"] },
        deletedAt: null,
      },
    }),
    prisma.job.count({
      where: { organizationId, status: "IN_PROGRESS", deletedAt: null },
    }),
    prisma.estimate.count({
      where: { organizationId, status: { in: ["DRAFT", "SENT"] } },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["OVERDUE", "SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: new Date() },
      },
      select: { balanceCents: true },
    }),
    prisma.payment.aggregate({
      where: {
        organizationId,
        status: "SUCCEEDED",
        processedAt: { gte: today, lt: tomorrow },
      },
      _sum: { amountCents: true },
    }),
    prisma.job.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        vehicle: { select: { year: true, make: true, model: true } },
        assignments: {
          include: { user: { select: { fullName: true } } },
          where: { isLead: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const overdueTotal = overdueInvoices.reduce(
    (sum, inv) => sum + inv.balanceCents,
    0
  );

  return {
    openJobsCount,
    inProgressCount,
    pendingEstimatesCount,
    overdueTotal,
    overdueCount: overdueInvoices.length,
    revenueToday: revenueToday._sum.amountCents ?? 0,
    recentJobs,
  };
}

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const data = await getDashboardData(user.organizationId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New job
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <DashboardKPIs
          revenueToday={data.revenueToday}
          openJobs={data.openJobsCount}
          inProgress={data.inProgressCount}
          pendingEstimates={data.pendingEstimatesCount}
          overdueTotal={data.overdueTotal}
          overdueCount={data.overdueCount}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DashboardRecentJobs jobs={data.recentJobs} />
          </div>
          <div>
            <DashboardAlerts
              overdueCount={data.overdueCount}
              overdueTotal={data.overdueTotal}
              pendingEstimates={data.pendingEstimatesCount}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
