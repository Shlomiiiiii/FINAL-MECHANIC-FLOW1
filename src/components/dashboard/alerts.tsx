import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { formatCents } from "@/lib/utils";

interface DashboardAlertsProps {
  overdueCount: number;
  overdueTotal: number;
  pendingEstimates: number;
}

export function DashboardAlerts({
  overdueCount,
  overdueTotal,
  pendingEstimates,
}: DashboardAlertsProps) {
  const alerts = [];

  if (overdueCount > 0) {
    alerts.push({
      id: "overdue",
      icon: AlertTriangle,
      iconClass: "text-destructive",
      bgClass: "bg-destructive/5 border-destructive/20",
      message: `${overdueCount} invoice${overdueCount > 1 ? "s" : ""} overdue`,
      sub: `${formatCents(overdueTotal)} outstanding`,
      href: "/invoices?status=overdue",
    });
  }

  if (pendingEstimates > 0) {
    alerts.push({
      id: "estimates",
      icon: Clock,
      iconClass: "text-warning",
      bgClass: "bg-warning/5 border-warning/20",
      message: `${pendingEstimates} estimate${pendingEstimates > 1 ? "s" : ""} pending`,
      sub: "Awaiting customer approval",
      href: "/estimates?status=sent",
    });
  }

  return (
    <Card>
      <CardHeader className="py-4 px-5">
        <CardTitle className="text-sm font-semibold">Alerts</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-2">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-3">
            <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-success">All clear</p>
              <p className="text-xs text-muted-foreground">No items need attention</p>
            </div>
          </div>
        ) : (
          alerts.map((alert) => (
            <Link key={alert.id} href={alert.href}>
              <div
                className={`flex items-center gap-3 rounded-lg border px-3 py-3 cursor-pointer hover:opacity-80 transition-opacity ${alert.bgClass}`}
              >
                <alert.icon className={`h-4 w-4 flex-shrink-0 ${alert.iconClass}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.sub}</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
