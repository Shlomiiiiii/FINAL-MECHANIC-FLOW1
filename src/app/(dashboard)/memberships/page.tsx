import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanCard } from "@/components/memberships/plan-card";
import { getMembershipAnalytics } from "@/lib/memberships";
import {
  TrendingUp, Users, DollarSign, Percent,
  Plus, BarChart3, Tag, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Memberships" };

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export default async function MembershipsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) redirect("/dashboard");

  const [plans, analytics, recentMembers, overdueCount] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { organizationId: user.organizationId, status: { not: "archived" } },
      include: { _count: { select: { memberships: { where: { status: { in: ["active","trialing"] } } } } } },
      orderBy: [{ tier: "asc" }, { sortOrder: "asc" }],
    }),
    getMembershipAnalytics(user.organizationId),
    prisma.customerMembership.findMany({
      where: { organizationId: user.organizationId, status: { in: ["active","trialing"] } },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        plan:     { select: { name: true, color: true, tier: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.customerMembership.count({
      where: { organizationId: user.organizationId, status: "past_due" },
    }),
  ]);

  const kpis = [
    { label: "Monthly Recurring Revenue", value: formatCents(analytics.mrrCents), sub: `ARR: ${formatCents(analytics.arrCents)}`, icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
    { label: "Active members", value: String(analytics.activeMembers), sub: `${analytics.trialMembers} in trial`, icon: Users, color: "text-primary", bg: "bg-primary/5" },
    { label: "Churn rate", value: `${analytics.churnRate}%`, sub: `${analytics.cancelledThisMonth} cancelled this month`, icon: Percent, color: analytics.churnRate > 5 ? "text-destructive" : "text-muted-foreground", bg: analytics.churnRate > 5 ? "bg-destructive/5" : "bg-muted" },
    { label: "Avg lifetime value", value: formatCents(analytics.avgLifetimeCents), sub: analytics.topPlan ? `Top: ${analytics.topPlan.name} (${analytics.topPlan.count})` : "No data yet", icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Memberships"
        subtitle={`${analytics.activeMembers} active members · ${formatCents(analytics.mrrCents)}/mo MRR`}
        actions={
          ["OWNER","MANAGER"].includes(user.role) ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <Link href="/memberships/plans/new"><Plus className="h-3.5 w-3.5" /> New plan</Link>
              </Button>
              <Button size="sm" asChild className="gap-1.5">
                <Link href="/memberships/members"><Users className="h-3.5 w-3.5" /> All members</Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Overdue alert */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {overdueCount} member{overdueCount > 1 ? "s" : ""} with failed payments — they're in their grace period
            </p>
            <Link href="/memberships/members?status=past_due" className="ml-auto text-xs text-amber-700 underline">
              View →
            </Link>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", k.bg)}>
                  <k.icon className={cn("h-3.5 w-3.5", k.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold tabular-nums">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Plans grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Plans ({plans.length})</h2>
            {["OWNER","MANAGER"].includes(user.role) && (
              <Link href="/memberships/plans/new" className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Create plan
              </Link>
            )}
          </div>
          {plans.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
              <Tag className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No membership plans yet</p>
              <p className="text-sm text-muted-foreground mb-4">Create your first plan to start building recurring revenue.</p>
              <Button size="sm" asChild><Link href="/memberships/plans/new">Create first plan</Link></Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plans.map((plan) => <PlanCard key={plan.id} plan={plan as any} />)}
            </div>
          )}
        </div>

        {/* Recent members */}
        {recentMembers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Recent members</h2>
              <Link href="/memberships/members" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="grid grid-cols-[1fr_160px_100px_100px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Customer</span><span>Plan</span><span>Status</span><span>Since</span>
              </div>
              <div className="divide-y divide-border">
                {recentMembers.map((m) => (
                  <Link key={m.id} href={`/memberships/members/${m.id}`}
                    className="grid grid-cols-[1fr_160px_100px_100px] gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                    <span className="text-sm font-medium">{m.customer.firstName} {m.customer.lastName}</span>
                    <span className="text-sm" style={{ color: m.plan.color ?? "#3b82f6" }}>{m.plan.name}</span>
                    <Badge variant={m.status === "active" ? "success" : m.status === "trialing" ? "info" : "warning"} className="text-[10px] py-0 w-fit">
                      {m.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(m.startedAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
