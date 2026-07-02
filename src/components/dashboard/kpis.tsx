import { TrendingUp, ClipboardList, FileText, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

interface DashboardKPIsProps {
  revenueToday: number;
  openJobs: number;
  inProgress: number;
  pendingEstimates: number;
  overdueTotal: number;
  overdueCount: number;
}

export function DashboardKPIs({
  revenueToday,
  openJobs,
  inProgress,
  pendingEstimates,
  overdueTotal,
  overdueCount,
}: DashboardKPIsProps) {
  const kpis = [
    {
      label: "Revenue today",
      value: formatCents(revenueToday),
      sub: "Collected payments",
      icon: TrendingUp,
      iconColor: "text-success",
      iconBg: "bg-success/10",
    },
    {
      label: "Open jobs",
      value: openJobs.toString(),
      sub: `${inProgress} in progress`,
      icon: ClipboardList,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      label: "Pending estimates",
      value: pendingEstimates.toString(),
      sub: "Awaiting approval",
      icon: FileText,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
    },
    {
      label: "Overdue invoices",
      value: formatCents(overdueTotal),
      sub: `${overdueCount} invoice${overdueCount !== 1 ? "s" : ""} overdue`,
      icon: AlertTriangle,
      iconColor: "text-destructive",
      iconBg: "bg-destructive/10",
      alert: overdueCount > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className={kpi.alert ? "border-destructive/30" : ""}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground truncate">
                  {kpi.label}
                </p>
                <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
                  {kpi.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
              </div>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${kpi.iconBg}`}
              >
                <kpi.icon className={`h-4 w-4 ${kpi.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
