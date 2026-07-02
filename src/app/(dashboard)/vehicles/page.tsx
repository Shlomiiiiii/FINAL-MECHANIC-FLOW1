import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, Plus, Gauge, AlertTriangle, Wrench, DollarSign, User } from "lucide-react";
import { formatCents, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { jobs: { where: { deletedAt: null } } } },
      maintenanceReminders: {
        where: { isActive: true },
        select: { dueDate: true, dueMiles: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const now = new Date();
  const vehicleIds = vehicles.map((v) => v.id);

  // Get total spent per vehicle
  const jobTotals = await prisma.job.groupBy({
    by: ["vehicleId"],
    where: {
      vehicleId: { in: vehicleIds },
      organizationId: user.organizationId,
      status: { in: ["COMPLETED", "INVOICED", "CLOSED"] },
      deletedAt: null,
    },
    _sum: { totalCents: true },
  });
  const totalMap = new Map(jobTotals.map((j) => [j.vehicleId, j._sum.totalCents ?? 0]));

  // Get open job count per vehicle
  const openJobs = await prisma.job.groupBy({
    by: ["vehicleId"],
    where: {
      vehicleId: { in: vehicleIds },
      organizationId: user.organizationId,
      status: { in: ["LEAD", "SCHEDULED", "IN_PROGRESS", "PENDING_REVIEW"] },
      deletedAt: null,
    },
    _count: true,
  });
  const openMap = new Map(openJobs.map((j) => [j.vehicleId, j._count]));

  const enriched = vehicles.map((v) => {
    const overdueCount = v.maintenanceReminders.filter((r) => {
      const dOver = r.dueDate && r.dueDate < now;
      const mOver = r.dueMiles && v.mileageLastSeen && v.mileageLastSeen >= r.dueMiles;
      return dOver || mOver;
    }).length;
    return {
      ...v,
      _totalSpent: totalMap.get(v.id) ?? 0,
      _openJobs: openMap.get(v.id) ?? 0,
      _overdueCount: overdueCount,
    };
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Vehicles"
        subtitle={`${vehicles.length} vehicles on file`}
        actions={
          <Button size="sm" className="gap-1.5" asChild>
            <Link href="/customers">
              <Plus className="h-3.5 w-3.5" /> Add via customer
            </Link>
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        {enriched.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Car className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No vehicles yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Vehicles are added via customer profiles.</p>
            <Button size="sm" asChild><Link href="/customers">Go to Customers</Link></Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {enriched.map((v) => {
              const label = [v.year, v.make, v.model].filter(Boolean).join(" ") || "Unknown vehicle";
              return (
                <Link key={v.id} href={`/vehicles/${v.id}`}
                  className="group rounded-xl border border-border bg-card hover:border-border-strong hover:shadow-sm transition-all overflow-hidden">
                  {/* Photo placeholder */}
                  <div className="h-32 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border-b border-border relative">
                    {v.primaryPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.primaryPhotoUrl} alt={label} className="h-full w-full object-cover" />
                    ) : (
                      <Car className="h-10 w-10 text-muted-foreground/40" />
                    )}
                    {v._overdueCount > 0 && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {v._overdueCount} overdue
                        </Badge>
                      </div>
                    )}
                    {v._openJobs > 0 && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="info" className="text-[10px] gap-1">
                          <Wrench className="h-3 w-3" />
                          {v._openJobs} open job{v._openJobs > 1 ? "s" : ""}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {label}
                      </h3>
                      {v.trim && <p className="text-xs text-muted-foreground">{v.trim}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {v.licensePlate && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{v.licensePlate}</span>
                        </div>
                      )}
                      {v.mileageLastSeen && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Gauge className="h-3 w-3 flex-shrink-0" />
                          {v.mileageLastSeen.toLocaleString()} mi
                        </div>
                      )}
                      {v._totalSpent > 0 && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <DollarSign className="h-3 w-3 flex-shrink-0" />
                          {formatCents(v._totalSpent)} lifetime
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="h-3 w-3 flex-shrink-0" />
                        {v.customer.firstName} {v.customer.lastName}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                      {v.fuelType && (
                        <Badge variant="secondary" className="text-[10px] capitalize">{v.fuelType}</Badge>
                      )}
                      {v.transmission && (
                        <Badge variant="secondary" className="text-[10px] capitalize">{v.transmission}</Badge>
                      )}
                      {v.drivetrain && (
                        <Badge variant="secondary" className="text-[10px] uppercase">{v.drivetrain}</Badge>
                      )}
                      {v.colorExterior && (
                        <span className="text-[10px] text-muted-foreground">{v.colorExterior}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
