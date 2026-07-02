import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Car, Calendar, Gauge, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function ReminderStatus({ reminder }: { reminder: any }) {
  const now = new Date();
  const due = reminder.dueDate ? new Date(reminder.dueDate) : null;
  const isOverdue  = due && due < now;
  const isDueSoon  = due && due <= new Date(now.getTime() + 30 * 86400000);
  return (
    <div className={cn("flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg",
      isOverdue ? "bg-red-50 text-red-700" : isDueSoon ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
    )}>
      {isOverdue ? <AlertTriangle className="h-3 w-3 flex-shrink-0" /> :
       isDueSoon ? <AlertTriangle className="h-3 w-3 flex-shrink-0" /> :
                   <CheckCircle className="h-3 w-3 flex-shrink-0" />}
      {reminder.name} {due && `· ${isOverdue ? "overdue" : `due ${due.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}`}
    </div>
  );
}

export default async function PortalVehiclesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const [vehicles, org, customer] = await Promise.all([
    prisma.vehicle.findMany({
      where: { customerId: session.customerId, organizationId: session.organizationId },
      include: { maintenanceReminders: { where: { isActive: true }, orderBy: { dueDate: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true, logoUrl: true, portalAllowBooking: true, portalAllowChat: true, portalAllowPhotoUpload: true } }),
    prisma.customer.findUnique({ where: { id: session.customerId }, select: { firstName: true, lastName: true } }),
  ]);

  if (!org || !customer) redirect(`/portal/${slug}/login`);

  return (
    <PortalLayout slug={slug} customerName={`${customer.firstName} ${customer.lastName}`}
      orgName={org.name} orgLogo={org.logoUrl}
      allowBooking={org.portalAllowBooking} allowChat={org.portalAllowChat} allowPhotos={org.portalAllowPhotoUpload}>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
        <h1 className="text-xl font-bold text-slate-900">My Vehicles</h1>

        {vehicles.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Car className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No vehicles on file</p>
          </div>
        ) : vehicles.map(v => (
          <div key={v.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Car className="h-6 w-6 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900">{v.year} {v.make} {v.model} {v.trim}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
                  {v.licensePlate && <span>Plate: {v.licensePlate}</span>}
                  {v.vin && <span>VIN: {v.vin}</span>}
                  {v.colorExterior && <span>Color: {v.colorExterior}</span>}
                  {v.engine && <span>Engine: {v.engine}</span>}
                  {v.transmission && <span className="capitalize">{v.transmission}</span>}
                </div>
                {v.oilType && (
                  <p className="text-xs text-slate-500 mt-1">Oil: {v.oilType}{v.oilCapacityQt && ` · ${v.oilCapacityQt}qt`}</p>
                )}
                {v.tireSize && <p className="text-xs text-slate-500">Tires: {v.tireSize}</p>}
              </div>
            </div>
            {v.maintenanceReminders.length > 0 && (
              <div className="px-5 pb-4 space-y-1.5">
                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide mb-2">Maintenance reminders</p>
                {v.maintenanceReminders.map(r => <ReminderStatus key={r.id} reminder={r} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </PortalLayout>
  );
}
