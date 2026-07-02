"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, TrendingUp, Wrench, FileText, BarChart3, ArrowUpRight, ArrowDownRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt     = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
const fmtFull = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Period = "week" | "month" | "quarter" | "year";

function KpiCard({ label, value, sub, icon: Icon, colorBg, colorText }: any) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center mb-3", colorBg)}>
        <Icon className={cn("h-4 w-4", colorText)} />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-amber-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className="bg-primary h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-16 text-right">{fmt(value)}</span>
    </div>
  );
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
];

function getPeriodFrom(period: Period): Date {
  const now = new Date();
  if (period === "week")    { const d = new Date(now); d.setDate(now.getDate() - 7); return d; }
  if (period === "month")   return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = getPeriodFrom(period);
      const qs = new URLSearchParams({ from: from.toISOString(), to: new Date().toISOString() });
      const res = await fetch(`/api/reports?${qs}`);
      if (res.ok) { const j = await res.json(); setData(j.data); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:px-6 flex-shrink-0 pl-14 md:pl-6">
        <BarChart3 className="h-4 w-4 text-primary flex-shrink-0" />
        <h1 className="text-sm font-semibold flex-1">Reports</h1>
        {/* Period switcher */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden flex-shrink-0">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Failed to load reports</div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Revenue collected"  value={fmt(data.revenue.collected)}  icon={DollarSign} colorBg="bg-green-50"  colorText="text-green-600" />
              <KpiCard label="Outstanding balance" value={fmt(data.revenue.outstanding)} icon={FileText}   colorBg={data.revenue.outstanding > 0 ? "bg-amber-50" : "bg-muted"} colorText={data.revenue.outstanding > 0 ? "text-amber-600" : "text-muted-foreground"} sub={data.revenue.overdue > 0 ? `${fmt(data.revenue.overdue)} overdue` : undefined} />
              <KpiCard label="Jobs completed"     value={data.jobs.completed}           icon={Wrench}     colorBg="bg-blue-50"   colorText="text-blue-600"  sub={`of ${data.jobs.total} total`} />
              <KpiCard label="Avg job value"      value={fmtFull(data.jobs.avgValue)}   icon={TrendingUp} colorBg="bg-purple-50" colorText="text-purple-600" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Revenue by service type */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Revenue by service type</h2>
                {data.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed jobs in this period</p>
                ) : (
                  <div className="space-y-3">
                    {data.byCategory.map(([cat, val]: [string, number]) => (
                      <Bar key={cat} label={cat} value={val} max={data.byCategory[0][1]} />
                    ))}
                  </div>
                )}
              </div>

              {/* Top customers */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Top customers by lifetime spend</h2>
                {data.topCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No customer data yet</p>
                ) : (
                  <div className="space-y-3">
                    {data.topCustomers.map((c: any, i: number) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0">#{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-muted-foreground">{c.totalJobCount} visits</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{fmt(c.lifetimeRevenueCents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Revenue trend */}
            {data.monthlyTrend.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Monthly revenue trend</h2>
                <div className="space-y-3">
                  {(() => {
                    const max = Math.max(...data.monthlyTrend.map(([,v]: [string,number]) => v), 1);
                    return data.monthlyTrend.map(([month, val]: [string, number]) => (
                      <Bar key={month} label={month} value={val} max={max} />
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Invoice + customer summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Invoice summary</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Paid",     value: data.revenue.paidCount,    color: "text-green-600" },
                    { label: "Pending",  value: data.revenue.pendingCount,  color: "text-amber-600" },
                    { label: "Overdue",  value: data.revenue.overdueCount,  color: "text-red-600" },
                    { label: "Total revenue", value: fmt(data.revenue.collected), color: "text-foreground" },
                  ].map(s => (
                    <div key={s.label} className="bg-muted/30 rounded-lg p-3 text-center">
                      <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Customers</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total customers", value: data.customers.total, color: "text-foreground" },
                    { label: "New this period", value: data.customers.new,   color: "text-primary" },
                    { label: "Jobs completed",  value: data.jobs.completed,  color: "text-green-600" },
                    { label: "Total job value", value: fmt(data.jobs.totalValue), color: "text-foreground" },
                  ].map(s => (
                    <div key={s.label} className="bg-muted/30 rounded-lg p-3 text-center">
                      <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
