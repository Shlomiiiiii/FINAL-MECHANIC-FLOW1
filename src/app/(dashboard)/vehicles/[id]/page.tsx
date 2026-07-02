import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaintenanceSchedule } from "@/components/vehicles/maintenance-schedule";
import {
  Car, Edit, Wrench, Receipt, DollarSign, Clock, Shield,
  Gauge, AlertTriangle, Plus, ExternalLink, Calendar, Package,
} from "lucide-react";
import { formatCents, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@prisma/client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = await prisma.vehicle.findUnique({ where: { id }, select: { year: true, make: true, model: true } });
  return { title: v ? `${v.year} ${v.make} ${v.model}` : "Vehicle" };
}

const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "success" },
  PENDING_REVIEW: { label: "Review", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  INVOICED: { label: "Invoiced", variant: "info" },
  CLOSED: { label: "Closed", variant: "outline" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export default async function VehicleProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, phonePrimary: true } },
      jobs: {
        where: { deletedAt: null },
        include: {
          lineItems: {
            include: { inventoryItem: { select: { name: true } } },
          },
          assignments: {
            include: { user: { select: { fullName: true } } },
            where: { isLead: true },
            take: 1,
          },
          invoices: { select: { id: true, invoiceNumber: true, totalCents: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      maintenanceReminders: {
        orderBy: [{ isActive: "desc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!vehicle) notFound();

  // Compute metrics
  const completedJobs = vehicle.jobs.filter((j) =>
    ["COMPLETED", "INVOICED", "CLOSED"].includes(j.status)
  );
  const openJobs = vehicle.jobs.filter((j) =>
    ["LEAD", "SCHEDULED", "IN_PROGRESS", "PENDING_REVIEW"].includes(j.status)
  );
  const totalSpent = completedJobs.reduce((s, j) => s + j.totalCents, 0);

  // Warranty status
  const today = new Date();
  const warrantyExpired = vehicle.warrantyExpiry && vehicle.warrantyExpiry < today;
  const warrantyActive = vehicle.warrantyExpiry && vehicle.warrantyExpiry >= today;
  const warrantyMilesExceeded = vehicle.warrantyMiles && vehicle.mileageLastSeen
    ? vehicle.mileageLastSeen > vehicle.warrantyMiles : false;
  const warrantyStatus = !vehicle.warrantyExpiry && !vehicle.warrantyMiles
    ? "unknown"
    : warrantyExpired || warrantyMilesExceeded
    ? "expired"
    : "active";

  // Maintenance overdue count
  const now = new Date();
  const overdueCount = vehicle.maintenanceReminders.filter((r) => {
    if (!r.isActive) return false;
    const dateOverdue = r.dueDate && r.dueDate < now;
    const mileOverdue = r.dueMiles && vehicle.mileageLastSeen && vehicle.mileageLastSeen >= r.dueMiles;
    return dateOverdue || mileOverdue;
  }).length;

  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");

  // Enrich reminders with status
  const enrichedReminders = vehicle.maintenanceReminders.map((r) => {
    const mileageOverdue = r.dueMiles && vehicle.mileageLastSeen && vehicle.mileageLastSeen >= r.dueMiles;
    const dateOverdue = r.dueDate && r.dueDate < today;
    const mileageDueSoon = r.dueMiles && vehicle.mileageLastSeen && (r.dueMiles - vehicle.mileageLastSeen) <= 500;
    const dateDueSoon = r.dueDate && r.dueDate >= today && r.dueDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const status = mileageOverdue || dateOverdue ? "overdue" : mileageDueSoon || dateDueSoon ? "due_soon" : r.dueMiles || r.dueDate ? "ok" : "unknown";
    return { ...r, _status: status as "overdue" | "due_soon" | "ok" | "unknown" };
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title={vehicleLabel || "Vehicle"}
        subtitle={`${vehicle.customer.firstName} ${vehicle.customer.lastName}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <Link href={`/vehicles/${id}/edit`}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
            <Button size="sm" asChild className="gap-1.5">
              <Link href={`/jobs/new?vehicleId=${id}&customerId=${vehicle.customerId}`}>
                <Plus className="h-3.5 w-3.5" /> New job
              </Link>
            </Button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6">

          {/* Vehicle identity card */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-start gap-5 p-6 border-b border-border">
              {/* Vehicle icon / placeholder photo */}
              <div className="h-16 w-24 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border border-border">
                {vehicle.primaryPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={vehicle.primaryPhotoUrl} alt={vehicleLabel} className="h-full w-full object-cover rounded-lg" />
                ) : (
                  <Car className="h-7 w-7 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-foreground">{vehicleLabel || "Unknown vehicle"}</h1>
                <div className="flex flex-wrap gap-2 mt-1.5 text-sm text-muted-foreground">
                  {vehicle.licensePlate && <span>🪪 {vehicle.licensePlate}</span>}
                  {vehicle.vin && (
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                      VIN: {vehicle.vin}
                    </span>
                  )}
                  {vehicle.colorExterior && <span>🎨 {vehicle.colorExterior}</span>}
                  {vehicle.fuelType && <span className="capitalize">{vehicle.fuelType}</span>}
                </div>
              </div>

              {/* Customer link */}
              <Link href={`/customers/${vehicle.customerId}`}
                className="flex-shrink-0 text-sm text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="h-3.5 w-3.5" />
                {vehicle.customer.firstName} {vehicle.customer.lastName}
              </Link>
            </div>

            {/* Specs strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              {[
                { label: "Engine", value: vehicle.engine },
                { label: "Transmission", value: vehicle.transmission ? vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1) : null },
                { label: "Drivetrain", value: vehicle.drivetrain?.toUpperCase() },
                { label: "Fuel", value: vehicle.fuelType ? vehicle.fuelType.charAt(0).toUpperCase() + vehicle.fuelType.slice(1) : null },
                { label: "Oil type", value: vehicle.oilType },
                { label: "Tire size", value: vehicle.tireSize },
                { label: "Tire pressure", value: vehicle.tirePressureFront ? `${vehicle.tirePressureFront}/${vehicle.tirePressureRear ?? "?"} PSI` : null },
                { label: "Horsepower", value: vehicle.horsepower ? `${vehicle.horsepower} hp` : null },
              ].filter((s) => s.value).map((spec) => (
                <div key={spec.label} className="px-4 py-3 border-b border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{spec.label}</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{spec.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: "Current mileage",
                value: vehicle.mileageLastSeen ? `${vehicle.mileageLastSeen.toLocaleString()} mi` : "Unknown",
                icon: Gauge,
                color: "text-primary", bg: "bg-primary/5",
              },
              {
                label: "Total spent",
                value: formatCents(totalSpent),
                icon: DollarSign,
                color: "text-green-600", bg: "bg-green-50",
              },
              {
                label: "Open jobs",
                value: String(openJobs.length),
                icon: Wrench,
                color: openJobs.length > 0 ? "text-blue-600" : "text-muted-foreground",
                bg: openJobs.length > 0 ? "bg-blue-50" : "bg-muted",
              },
              {
                label: "Completed jobs",
                value: String(completedJobs.length),
                icon: Clock,
                color: "text-muted-foreground", bg: "bg-muted",
              },
              {
                label: "Maintenance",
                value: overdueCount > 0 ? `${overdueCount} overdue` : "Up to date",
                icon: overdueCount > 0 ? AlertTriangle : Clock,
                color: overdueCount > 0 ? "text-destructive" : "text-success",
                bg: overdueCount > 0 ? "bg-destructive/5" : "bg-success/5",
              },
              {
                label: "Warranty",
                value: warrantyStatus === "active" ? `Exp. ${formatDate(vehicle.warrantyExpiry!)}` : warrantyStatus === "expired" ? "Expired" : "Not set",
                icon: Shield,
                color: warrantyStatus === "active" ? "text-green-600" : warrantyStatus === "expired" ? "text-destructive" : "text-muted-foreground",
                bg: warrantyStatus === "active" ? "bg-green-50" : warrantyStatus === "expired" ? "bg-destructive/5" : "bg-muted",
              },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", m.bg)}>
                    <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">{m.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Notes */}
          {vehicle.notes && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1 uppercase tracking-wide">Vehicle notes</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{vehicle.notes}</p>
            </div>
          )}

          {/* Main tabs */}
          <div className="bg-card border border-border rounded-xl p-6">
            <Tabs defaultValue="history">
              <TabsList className="w-full justify-start bg-transparent p-0 h-auto gap-0 border-b border-border rounded-none mb-6">
                {[
                  { value: "history", label: `Service history (${completedJobs.length})` },
                  { value: "maintenance", label: "Maintenance schedule" },
                  { value: "specs", label: "Full specs" },
                  { value: "warranty", label: "Warranty" },
                ].map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* SERVICE HISTORY */}
              <TabsContent value="history">
                {completedJobs.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No completed service history yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {completedJobs.map((job) => {
                      const s = JOB_STATUS_CONFIG[job.status as JobStatus];
                      const tech = job.assignments[0]?.user.fullName;
                      const parts = job.lineItems.filter((li) => li.itemType === "PART");
                      const labor = job.lineItems.filter((li) => li.itemType === "LABOR");
                      const totalLaborHours = labor.reduce((s, l) => s + Number(l.laborHours ?? 0), 0);
                      const invoice = job.invoices[0];

                      return (
                        <div key={job.id} className="rounded-lg border border-border overflow-hidden">
                          {/* Job header */}
                          <div className="flex items-center gap-4 px-4 py-3 bg-muted/30 border-b border-border">
                            <Badge variant={s.variant} className="text-[10px] py-0">{s.label}</Badge>
                            <div className="flex-1 min-w-0">
                              <Link href={`/jobs/${job.id}`}
                                className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
                                {job.title}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {job.jobNumber}
                                {job.mileageIn && ` · ${job.mileageIn.toLocaleString()} mi at service`}
                                {tech && ` · ${tech}`}
                                {job.completedAt && ` · ${formatDate(job.completedAt)}`}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-semibold tabular-nums">{formatCents(job.totalCents)}</div>
                              {invoice && (
                                <Link href={`/invoices/${invoice.id}`} className="text-xs text-primary hover:underline">
                                  {invoice.invoiceNumber}
                                </Link>
                              )}
                            </div>
                          </div>

                          {/* Line items breakdown */}
                          <div className="px-4 py-3 grid grid-cols-2 gap-4">
                            {/* Labor */}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <Wrench className="h-3 w-3" /> Labor
                                {totalLaborHours > 0 && ` · ${totalLaborHours.toFixed(1)}h`}
                              </p>
                              {labor.length === 0 ? (
                                <p className="text-xs text-muted-foreground">None</p>
                              ) : labor.map((li) => (
                                <div key={li.id} className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground truncate mr-2">{li.description}</span>
                                  <span className="text-foreground font-medium flex-shrink-0">{formatCents(li.totalCents)}</span>
                                </div>
                              ))}
                            </div>

                            {/* Parts */}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <Package className="h-3 w-3" /> Parts ({parts.length})
                              </p>
                              {parts.length === 0 ? (
                                <p className="text-xs text-muted-foreground">None</p>
                              ) : parts.map((li) => (
                                <div key={li.id} className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground truncate mr-2">
                                    {li.inventoryItem?.name ?? li.description}
                                  </span>
                                  <span className="text-foreground font-medium flex-shrink-0">{formatCents(li.totalCents)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* MAINTENANCE */}
              <TabsContent value="maintenance">
                <MaintenanceSchedule
                  vehicleId={id}
                  initialReminders={enrichedReminders}
                  currentMileage={vehicle.mileageLastSeen}
                />
              </TabsContent>

              {/* FULL SPECS */}
              <TabsContent value="specs">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: "Year", value: vehicle.year },
                    { label: "Make", value: vehicle.make },
                    { label: "Model", value: vehicle.model },
                    { label: "Trim", value: vehicle.trim },
                    { label: "VIN", value: vehicle.vin, mono: true },
                    { label: "License plate", value: vehicle.licensePlate },
                    { label: "Exterior color", value: vehicle.colorExterior },
                    { label: "Interior color", value: vehicle.colorInterior },
                    { label: "Engine", value: vehicle.engine },
                    { label: "Cylinders", value: vehicle.cylinders },
                    { label: "Displacement", value: vehicle.displacement },
                    { label: "Horsepower", value: vehicle.horsepower ? `${vehicle.horsepower} hp` : null },
                    { label: "Transmission", value: vehicle.transmission },
                    { label: "Drivetrain", value: vehicle.drivetrain?.toUpperCase() },
                    { label: "Fuel type", value: vehicle.fuelType },
                    { label: "Oil type", value: vehicle.oilType },
                    { label: "Oil capacity", value: vehicle.oilCapacityQt ? `${vehicle.oilCapacityQt} qt` : null },
                    { label: "Tire size", value: vehicle.tireSize },
                    { label: "Tire pressure (front)", value: vehicle.tirePressureFront ? `${vehicle.tirePressureFront} PSI` : null },
                    { label: "Tire pressure (rear)", value: vehicle.tirePressureRear ? `${vehicle.tirePressureRear} PSI` : null },
                    { label: "Current mileage", value: vehicle.mileageLastSeen ? `${vehicle.mileageLastSeen.toLocaleString()} mi` : null },
                    { label: "Mileage at purchase", value: vehicle.mileageAtPurchase ? `${vehicle.mileageAtPurchase.toLocaleString()} mi` : null },
                    { label: "Purchase date", value: vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : null },
                  ].filter((s) => s.value !== null && s.value !== undefined).map((spec) => (
                    <div key={spec.label} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{spec.label}</p>
                      <p className={cn("text-sm font-medium text-foreground", (spec as any).mono && "font-mono text-xs")}>{spec.value}</p>
                    </div>
                  ))}
                </div>

                {vehicle.vinDecoded && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield className="h-3.5 w-3.5 text-green-600" />
                    VIN decoded via NHTSA vPIC · {vehicle.vinDecodedAt ? formatDate(vehicle.vinDecodedAt) : ""}
                  </div>
                )}
              </TabsContent>

              {/* WARRANTY */}
              <TabsContent value="warranty">
                <div className="max-w-md space-y-4">
                  <div className={cn("rounded-lg border p-4",
                    warrantyStatus === "active" ? "border-green-200 bg-green-50" :
                    warrantyStatus === "expired" ? "border-destructive/30 bg-destructive/5" :
                    "border-border bg-muted/30"
                  )}>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className={cn("h-4 w-4",
                        warrantyStatus === "active" ? "text-green-600" :
                        warrantyStatus === "expired" ? "text-destructive" : "text-muted-foreground"
                      )} />
                      <span className="text-sm font-semibold">
                        {warrantyStatus === "active" ? "Warranty active" :
                         warrantyStatus === "expired" ? "Warranty expired" : "Warranty unknown"}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      {vehicle.warrantyExpiry && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expiry date</span>
                          <span className="font-medium">{formatDate(vehicle.warrantyExpiry)}</span>
                        </div>
                      )}
                      {vehicle.warrantyMiles && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mileage limit</span>
                          <span className="font-medium">{vehicle.warrantyMiles.toLocaleString()} mi</span>
                        </div>
                      )}
                      {vehicle.mileageLastSeen && vehicle.warrantyMiles && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Miles remaining</span>
                          <span className={cn("font-medium", warrantyMilesExceeded && "text-destructive")}>
                            {warrantyMilesExceeded ? "Exceeded" : `${(vehicle.warrantyMiles - vehicle.mileageLastSeen).toLocaleString()} mi`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {vehicle.warrantyNotes && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warranty notes</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{vehicle.warrantyNotes}</p>
                    </div>
                  )}
                  {!vehicle.warrantyExpiry && !vehicle.warrantyMiles && (
                    <p className="text-sm text-muted-foreground">
                      No warranty information on file.{" "}
                      <Link href={`/vehicles/${id}/edit`} className="text-primary hover:underline">Add warranty →</Link>
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
