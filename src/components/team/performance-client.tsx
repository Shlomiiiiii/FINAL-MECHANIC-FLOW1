"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Wrench, Clock, DollarSign, Zap, Star } from "lucide-react";
import { getInitials } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Summary {
  employee: { id: string; fullName: string; color: string | null; position: string | null; role: string; avatarUrl: string | null };
  jobsCompleted: number;
  revenueGeneratedCents: number;
  laborHoursSold: number;
  hoursWorked: number;
  overtimeHours: number;
  efficiencyPct: number;
  avgJobValueCents: number;
  avgRating: string | null;
  comebackRate: string | null;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export function TeamPerformanceClient() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [totals,    setTotals]    = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team/performance/summary").then(r => r.json()).then(json => {
      setSummaries(json.data?.summaries ?? []);
      setTotals(json.data?.totals ?? null);
    }).catch(() => {}).finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Team totals */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Team revenue", value: fmt(totals.totalRevenue), icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
            { label: "Jobs completed", value: String(totals.totalJobs), icon: Wrench, color: "text-primary", bg: "bg-primary/5" },
            { label: "Hours worked",   value: `${totals.totalHours}h`, icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
            { label: "Avg efficiency", value: `${totals.avgEfficiency}%`, icon: Zap, color: totals.avgEfficiency >= 80 ? "text-green-600" : "text-amber-600", bg: totals.avgEfficiency >= 80 ? "bg-green-50" : "bg-amber-50" },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="p-4">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", m.bg)}>
                  <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-xl font-bold tabular-nums">{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Per-employee table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="grid grid-cols-[1fr_90px_90px_80px_80px_90px_80px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Employee</span><span className="text-right">Revenue</span><span className="text-right">Jobs</span>
          <span className="text-right">Hours</span><span className="text-right">OT</span>
          <span className="text-right">Efficiency</span><span className="text-right">Rating</span>
        </div>
        <div className="divide-y divide-border">
          {summaries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No data for this period.</div>
          ) : summaries.map((s, idx) => (
            <Link key={s.employee.id} href={`/team/${s.employee.id}`}
              className="grid grid-cols-[1fr_90px_90px_80px_80px_90px_80px] gap-3 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0">#{idx+1}</span>
                <Avatar className="h-7 w-7 flex-shrink-0">
                  {s.employee.avatarUrl
                    ? <img src={s.employee.avatarUrl} alt={s.employee.fullName} className="rounded-full object-cover" />
                    : <AvatarFallback className="text-[10px] font-bold" style={s.employee.color ? { backgroundColor: s.employee.color+"20", color: s.employee.color } : {}}>
                        {getInitials(s.employee.fullName)}
                      </AvatarFallback>
                  }
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.employee.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.employee.position ?? s.employee.role}</p>
                </div>
              </div>
              <p className="text-sm font-semibold tabular-nums text-right text-green-700">{fmt(s.revenueGeneratedCents)}</p>
              <p className="text-sm tabular-nums text-right">{s.jobsCompleted}</p>
              <p className="text-sm tabular-nums text-right">{s.hoursWorked}h</p>
              <p className={cn("text-sm tabular-nums text-right", s.overtimeHours > 0 ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                {s.overtimeHours > 0 ? `${s.overtimeHours}h` : "—"}
              </p>
              <div className="text-right">
                <span className={cn("text-sm font-semibold tabular-nums",
                  s.efficiencyPct >= 90 ? "text-green-600" :
                  s.efficiencyPct >= 70 ? "text-foreground" : "text-amber-600")}>
                  {s.efficiencyPct}%
                </span>
              </div>
              <p className="text-sm tabular-nums text-right">
                {s.avgRating ? `${Number(s.avgRating).toFixed(1)}★` : "—"}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
