import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Shield, Car, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function PortalMaintenancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const [reminders, org, customer] = await Promise.all([
    prisma.maintenanceReminder.findMany({
      where: { organizationId: session.organizationId, vehicle: { customerId: session.customerId }, isActive: true },
      include: { vehicle: { select: { year: true, make: true, model: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true, logoUrl: true, portalAllowBooking: true, portalAllowChat: true, portalAllowPhotoUpload: true } }),
    prisma.customer.findUnique({ where: { id: session.customerId }, select: { firstName: true, lastName: true } }),
  ]);

  if (!org || !customer) redirect(`/portal/${slug}/login`);
  const now = new Date();

  const overdue  = reminders.filter(r => r.dueDate && new Date(r.dueDate) < now);
  const dueSoon  = reminders.filter(r => r.dueDate && new Date(r.dueDate) >= now && new Date(r.dueDate) <= new Date(now.getTime() + 30 * 86400000));
  const ok       = reminders.filter(r => !r.dueDate || new Date(r.dueDate) > new Date(now.getTime() + 30 * 86400000));

  const ReminderCard = ({ r, state }: { r: any; state: "overdue"|"due_soon"|"ok" }) => (
    <div className={cn("rounded-xl border p-4 flex items-start gap-3",
      state === "overdue"  ? "border-red-200  bg-red-50/50" :
      state === "due_soon" ? "border-amber-200 bg-amber-50/50" : "border-green-100 bg-green-50/30"
    )}>
      {state === "overdue"  ? <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" /> :
       state === "due_soon" ? <Clock className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" /> :
                              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{r.name}</p>
        <p className="text-xs text-slate-500">{r.vehicle.year} {r.vehicle.make} {r.vehicle.model}</p>
        <div className="flex gap-3 mt-1 text-xs text-slate-500">
          {r.dueDate && <span>Due: {new Date(r.dueDate).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</span>}
          {r.dueMiles && <span>At: {r.dueMiles.toLocaleString()} mi</span>}
          {r.intervalMiles && <span>Every {r.intervalMiles.toLocaleString()} mi</span>}
          {r.intervalMonths && <span>Every {r.intervalMonths} months</span>}
        </div>
      </div>
    </div>
  );

  return (
    <PortalLayout slug={slug} customerName={`${customer.firstName} ${customer.lastName}`}
      orgName={org.name} orgLogo={org.logoUrl}
      allowBooking={org.portalAllowBooking} allowChat={org.portalAllowChat} allowPhotos={org.portalAllowPhotoUpload}>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <h1 className="text-xl font-bold text-slate-900">Maintenance Reminders</h1>

        {overdue.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Overdue ({overdue.length})</p>
            <div className="space-y-2">{overdue.map(r => <ReminderCard key={r.id} r={r} state="overdue" />)}</div>
          </section>
        )}
        {dueSoon.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">Due soon ({dueSoon.length})</p>
            <div className="space-y-2">{dueSoon.map(r => <ReminderCard key={r.id} r={r} state="due_soon" />)}</div>
          </section>
        )}
        {ok.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-3">Up to date ({ok.length})</p>
            <div className="space-y-2">{ok.map(r => <ReminderCard key={r.id} r={r} state="ok" />)}</div>
          </section>
        )}
        {reminders.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No maintenance reminders set up</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
