import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, TrendingUp, Clock, CheckCircle, XCircle, Eye } from "lucide-react";
import { formatCents, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { EstimateStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Estimates" };

const STATUS_CONFIG: Record<EstimateStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SENT: { label: "Sent", variant: "info" },
  APPROVED: { label: "Approved", variant: "success" },
  DECLINED: { label: "Declined", variant: "destructive" },
  EXPIRED: { label: "Expired", variant: "outline" },
  CONVERTED: { label: "Converted", variant: "success" },
};

export default async function EstimatesPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [estimates, analytics] = await Promise.all([
    prisma.estimate.findMany({
      where: { organizationId: user.organizationId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { year: true, make: true, model: true } },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.estimate.groupBy({
      by: ["status"],
      where: { organizationId: user.organizationId },
      _count: true,
      _sum: { totalCents: true },
    }),
  ]);

  const analyticsMap: Record<string, { count: number; total: number }> = {};
  for (const row of analytics) {
    analyticsMap[row.status] = { count: row._count, total: row._sum.totalCents ?? 0 };
  }

  const sentTotal = estimates.filter(e => e.status === "SENT").reduce((s,e)=>s+e.totalCents, 0);
  const approvedTotal = estimates.filter(e => e.status === "APPROVED").reduce((s,e)=>s+e.totalCents, 0);
  const totalSent = (analyticsMap.SENT?.count ?? 0) + (analyticsMap.APPROVED?.count ?? 0) + (analyticsMap.DECLINED?.count ?? 0);
  const approvalRate = totalSent > 0
    ? Math.round(((analyticsMap.APPROVED?.count ?? 0) / totalSent) * 100)
    : 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Estimates"
        subtitle={`${estimates.length} total`}
        actions={
          user.role !== "TECHNICIAN" ? (
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/customers"><Plus className="h-3.5 w-3.5" /> New estimate</Link>
            </Button>
          ) : undefined
        }
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Analytics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Approval rate", value: `${approvalRate}%`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", sub: `${analyticsMap.APPROVED?.count ?? 0} approved` },
            { label: "Pending", value: formatCents(sentTotal), icon: Clock, color: "text-blue-600", bg: "bg-blue-50", sub: `${analyticsMap.SENT?.count ?? 0} sent` },
            { label: "Pipeline", value: formatCents(approvedTotal + sentTotal), icon: TrendingUp, color: "text-primary", bg: "bg-primary/5", sub: "Approved + pending" },
            { label: "Declined", value: String(analyticsMap.DECLINED?.count ?? 0), icon: XCircle, color: "text-destructive", bg: "bg-destructive/5", sub: `${analyticsMap.EXPIRED?.count ?? 0} expired` },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="p-4">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", m.bg)}>
                  <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-lg font-semibold tabular-nums">{m.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "All", count: estimates.length },
            { label: "Sent", count: analyticsMap.SENT?.count ?? 0 },
            { label: "Approved", count: analyticsMap.APPROVED?.count ?? 0 },
            { label: "Declined", count: analyticsMap.DECLINED?.count ?? 0 },
            { label: "Draft", count: analyticsMap.DRAFT?.count ?? 0 },
          ].map((tab) => (
            <button key={tab.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-sm hover:bg-muted transition-colors">
              {tab.label}
              {tab.count > 0 && <span className="bg-muted-foreground/20 text-foreground text-xs px-1.5 py-0.5 rounded-full">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Table */}
        {estimates.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No estimates yet. <Link href="/customers" className="text-primary hover:underline">Create your first estimate →</Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-[120px_1fr_160px_120px_100px_120px_80px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border">
              {["NUMBER","TITLE","CUSTOMER","VEHICLE","STATUS","TOTAL","VIEWS"].map(h => (
                <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-border">
              {estimates.map((est) => {
                const s = STATUS_CONFIG[est.status as EstimateStatus];
                return (
                  <Link key={est.id} href={`/estimates/${est.id}`}
                    className="grid grid-cols-[120px_1fr_160px_120px_100px_120px_80px] gap-3 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
                    <span className="text-xs font-mono font-medium text-muted-foreground">{est.estimateNumber}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{est.title}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(est.createdAt)}</div>
                    </div>
                    <span className="text-sm text-muted-foreground truncate">{est.customer.firstName} {est.customer.lastName}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {est.vehicle ? `${est.vehicle.year} ${est.vehicle.make}` : "—"}
                    </span>
                    <Badge variant={s.variant} className="text-[10px] py-0 w-fit">{s.label}</Badge>
                    <span className="text-sm font-semibold tabular-nums">{formatCents(est.totalCents)}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3" />{est._count.views}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
