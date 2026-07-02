import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { Plus, TrendingUp, AlertTriangle, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { formatCents, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [invoices, statusGroups] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: user.organizationId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        vehicle:  { select: { year: true, make: true, model: true } },
        _count:   { select: { payments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { organizationId: user.organizationId },
      _count: true,
      _sum: { totalCents: true, balanceCents: true },
    }),
  ]);

  // Dashboard metrics
  const statusMap: Record<string, { count: number; total: number; balance: number }> = {};
  for (const g of statusGroups) {
    statusMap[g.status] = {
      count: g._count,
      total: g._sum.totalCents ?? 0,
      balance: g._sum.balanceCents ?? 0,
    };
  }

  const paidToday = invoices
    .filter((i) => i.status === "PAID" && i.paidAt && new Date(i.paidAt).toDateString() === new Date().toDateString())
    .reduce((s, i) => s + i.totalCents, 0);

  const outstanding = (statusMap.SENT?.balance ?? 0)
    + (statusMap.VIEWED?.balance ?? 0)
    + (statusMap.PARTIALLY_PAID?.balance ?? 0);

  const overdue = statusMap.OVERDUE?.balance ?? 0;

  const avgInvoice = invoices.length > 0
    ? Math.round(invoices.reduce((s, i) => s + i.totalCents, 0) / invoices.length)
    : 0;

  const ACTIVE_STATUSES: InvoiceStatus[] = ["SENT","VIEWED","PARTIALLY_PAID","OVERDUE"];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Invoices"
        subtitle={`${invoices.length} total`}
        actions={
          user.role !== "TECHNICIAN" ? (
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/invoices/new"><Plus className="h-3.5 w-3.5" /> New invoice</Link>
            </Button>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Outstanding", value: formatCents(outstanding), icon: TrendingUp, color: "text-primary", bg: "bg-primary/5", sub: `${(statusMap.SENT?.count ?? 0) + (statusMap.VIEWED?.count ?? 0) + (statusMap.PARTIALLY_PAID?.count ?? 0)} invoices` },
            { label: "Overdue",     value: formatCents(overdue),     icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/5", sub: `${statusMap.OVERDUE?.count ?? 0} invoices`, alert: overdue > 0 },
            { label: "Paid today",  value: formatCents(paidToday),   icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", sub: "collected today" },
            { label: "Avg invoice", value: formatCents(avgInvoice),  icon: BarChart3, color: "text-muted-foreground", bg: "bg-muted", sub: `from ${invoices.length} invoices` },
          ].map((m) => (
            <Card key={m.label} className={m.alert ? "border-destructive/30" : ""}>
              <CardContent className="p-4">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", m.bg)}>
                  <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-xl font-bold tabular-nums">{m.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active invoices alert strip */}
        {overdue > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive font-medium">
              {statusMap.OVERDUE?.count ?? 0} overdue invoice{(statusMap.OVERDUE?.count ?? 0) !== 1 ? "s" : ""} totalling {formatCents(overdue)}
            </p>
            <Link href="/invoices?status=OVERDUE" className="ml-auto text-xs text-destructive underline hover:no-underline">
              View overdue →
            </Link>
          </div>
        )}

        {/* Table */}
        {invoices.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No invoices yet.{" "}
            <Link href="/invoices/new" className="text-primary hover:underline">Create your first invoice →</Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-[110px_1fr_160px_140px_100px_120px_80px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Number</span><span>Customer</span><span>Vehicle</span>
              <span>Date</span><span>Status</span><span>Total</span><span>Balance</span>
            </div>
            <div className="divide-y divide-border">
              {invoices.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`}
                  className="grid grid-cols-[110px_1fr_160px_140px_100px_120px_80px] gap-3 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
                  <span className="text-xs font-mono font-medium text-muted-foreground">{inv.invoiceNumber}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{inv.customer.firstName} {inv.customer.lastName}</div>
                    {inv.dueDate && <div className={cn("text-xs", new Date(inv.dueDate) < new Date() && !["PAID","CANCELLED","ARCHIVED"].includes(inv.status) ? "text-destructive font-medium" : "text-muted-foreground")}>
                      Due {formatDate(inv.dueDate)}
                    </div>}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    {inv.vehicle ? `${inv.vehicle.year} ${inv.vehicle.make} ${inv.vehicle.model}` : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</span>
                  <InvoiceStatusBadge status={inv.status as InvoiceStatus} />
                  <span className="text-sm font-semibold tabular-nums">{formatCents(inv.totalCents)}</span>
                  <span className={cn("text-sm font-semibold tabular-nums",
                    inv.balanceCents > 0 && ACTIVE_STATUSES.includes(inv.status as InvoiceStatus)
                      ? "text-destructive" : "text-muted-foreground")}>
                    {inv.balanceCents > 0 ? formatCents(inv.balanceCents) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
