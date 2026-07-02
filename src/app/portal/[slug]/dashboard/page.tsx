import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { PortalLayout } from "@/components/portal/portal-layout";
import {
  Car, FileText, CreditCard, Calendar, Shield,
  AlertTriangle, ChevronRight, CheckCircle, Clock, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default async function PortalDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const [customer, org, vehicles, invoices, appointments, reminders, unreadMessages, membership] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: session.customerId },
      select: { firstName: true, lastName: true, email: true, lastServiceAt: true, totalJobCount: true, lifetimeRevenueCents: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: {
        name: true, slug: true, phone: true, logoUrl: true,
        portalWelcomeMessage: true, portalAllowBooking: true,
        portalAllowChat: true, portalAllowPhotoUpload: true,
      },
    }),
    prisma.vehicle.count({ where: { customerId: session.customerId, organizationId: session.organizationId } }),
    prisma.invoice.findMany({
      where: {
        customerId: session.customerId, organizationId: session.organizationId,
        status: { in: ["SENT","VIEWED","PARTIALLY_PAID","OVERDUE"] },
      },
      select: { id: true, invoiceNumber: true, balanceCents: true, status: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 3,
    }),
    prisma.appointment.findMany({
      where: {
        customerId: session.customerId, organizationId: session.organizationId,
        startsAt: { gte: new Date() },
        status: { notIn: ["CANCELLED","NO_SHOW"] },
      },
      include: { vehicle: { select: { year: true, make: true, model: true } } },
      orderBy: { startsAt: "asc" },
      take: 3,
    }),
    prisma.maintenanceReminder.count({
      where: {
        organizationId: session.organizationId,
        vehicle: { customerId: session.customerId },
        isActive: true,
        dueDate: { lte: new Date(Date.now() + 30 * 86400000) },
      },
    }),
    prisma.portalMessage.count({
      where: {
        customerId: session.customerId, organizationId: session.organizationId,
        senderType: "staff", isRead: false,
      },
    }),
    prisma.customerMembership.findFirst({
      where: { customerId: session.customerId, organizationId: session.organizationId, status: { in: ["active","trialing"] } },
      include: { plan: { select: { name: true, color: true } } },
    }),
  ]);

  if (!customer || !org) redirect(`/portal/${slug}/login`);

  const overdueBal = invoices.filter(i => i.status === "OVERDUE").reduce((s, i) => s + i.balanceCents, 0);
  const pendingBal = invoices.reduce((s, i) => s + i.balanceCents, 0);

  return (
    <PortalLayout slug={slug} customerName={`${customer.firstName} ${customer.lastName}`}
      orgName={org.name} orgLogo={org.logoUrl}
      allowBooking={org.portalAllowBooking} allowChat={org.portalAllowChat} allowPhotos={org.portalAllowPhotoUpload}>

      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">

        {/* Welcome header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-5 text-white">
          <p className="text-primary-foreground/70 text-sm mb-0.5">Welcome back,</p>
          <h1 className="text-2xl font-bold">{customer.firstName} {customer.lastName}</h1>
          {org.portalWelcomeMessage && <p className="text-primary-foreground/80 text-sm mt-2">{org.portalWelcomeMessage}</p>}
          {membership && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: membership.plan.color ?? "#fff" }} />
              <span className="text-xs font-semibold">{membership.plan.name} Member</span>
            </div>
          )}
        </div>

        {/* Alert strip */}
        {(overdueBal > 0 || reminders > 0 || unreadMessages > 0) && (
          <div className="space-y-2">
            {overdueBal > 0 && (
              <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-800 font-medium flex-1">
                  You have {fmt(overdueBal)} in overdue invoices
                </p>
                <Link href={`/portal/${slug}/invoices`} className="text-xs text-red-600 font-semibold hover:underline">
                  Pay now →
                </Link>
              </div>
            )}
            {reminders > 0 && (
              <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <Shield className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800 font-medium flex-1">{reminders} maintenance item{reminders > 1 ? "s" : ""} due soon</p>
                <Link href={`/portal/${slug}/maintenance`} className="text-xs text-amber-700 font-semibold hover:underline">View →</Link>
              </div>
            )}
            {unreadMessages > 0 && (
              <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                <p className="text-sm text-blue-800 font-medium flex-1">{unreadMessages} new message{unreadMessages > 1 ? "s" : ""} from the shop</p>
                <Link href={`/portal/${slug}/messages`} className="text-xs text-blue-700 font-semibold hover:underline">Read →</Link>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Vehicles", value: String(vehicles), href: `vehicles`, icon: Car, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Total visits", value: String(customer.totalJobCount), icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
            { label: "Lifetime spend", value: fmt(customer.lifetimeRevenueCents), icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Balance due", value: pendingBal > 0 ? fmt(pendingBal) : "Paid up!", icon: FileText,
              color: pendingBal > 0 ? "text-red-600" : "text-green-600",
              bg: pendingBal > 0 ? "bg-red-50" : "bg-green-50" },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-xl p-4 bg-white border border-slate-100", s.href && "cursor-pointer hover:border-primary/30 transition-colors")}>
              <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", s.bg)}>
                <s.icon className={cn("h-3.5 w-3.5", s.color)} />
              </div>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Upcoming appointments */}
        {appointments.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Upcoming appointments
              </h2>
              <Link href={`/portal/${slug}/appointments`} className="text-xs text-primary hover:underline">See all</Link>
            </div>
            {appointments.map(appt => (
              <div key={appt.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50 last:border-b-0">
                <div className="flex-shrink-0 text-center bg-primary/5 rounded-xl px-3 py-2 w-16">
                  <p className="text-[10px] text-primary/70 uppercase">{new Date(appt.startsAt).toLocaleDateString("en-US",{month:"short"})}</p>
                  <p className="text-xl font-bold text-primary leading-tight">{new Date(appt.startsAt).getDate()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{appt.title}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {new Date(appt.startsAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
                    {appt.vehicle && <span>· {appt.vehicle.year} {appt.vehicle.make} {appt.vehicle.model}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Invoices due */}
        {invoices.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Invoices requiring action
              </h2>
              <Link href={`/portal/${slug}/invoices`} className="text-xs text-primary hover:underline">All invoices</Link>
            </div>
            {invoices.map(inv => (
              <Link key={inv.id} href={`/portal/${slug}/invoices/${inv.id}`}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Invoice {inv.invoiceNumber}</p>
                  <p className="text-xs text-slate-400">
                    Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "upon receipt"}
                  </p>
                </div>
                <span className={cn("text-sm font-bold tabular-nums",
                  inv.status === "OVERDUE" ? "text-red-600" : "text-slate-900")}>
                  {fmt(inv.balanceCents)}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            org.portalAllowBooking && { href: `/portal/${slug}/appointments/new`, label: "Book service", icon: Calendar, color: "text-primary", bg: "bg-primary/5" },
            { href: `/portal/${slug}/history`, label: "Service history", icon: Wrench, color: "text-slate-700", bg: "bg-slate-100" },
            org.portalAllowChat && { href: `/portal/${slug}/messages`, label: "Message shop", icon: "💬", color: "text-green-700", bg: "bg-green-50" },
            { href: `/portal/${slug}/maintenance`, label: "Maintenance", icon: Shield, color: "text-amber-700", bg: "bg-amber-50" },
          ].filter(Boolean).map((action: any) => (
            <Link key={action.href} href={action.href}
              className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-100 bg-white hover:border-primary/30 transition-colors text-center")}>
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", action.bg)}>
                {typeof action.icon === "string"
                  ? <span className="text-xl">{action.icon}</span>
                  : <action.icon className={cn("h-5 w-5", action.color)} />}
              </div>
              <span className="text-xs font-medium text-slate-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
