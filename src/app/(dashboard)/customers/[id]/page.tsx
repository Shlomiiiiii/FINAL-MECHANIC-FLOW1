import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerProfileTabs } from "@/components/customers/customer-profile-tabs";
import {
  Phone, Mail, MapPin, Building2, AlertCircle, Edit,
  Plus, Wrench, FileText, Calendar, TrendingUp, Clock,
  CreditCard, BarChart3, ExternalLink,
} from "lucide-react";
import { getInitials, formatCents, formatDate, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.customer.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: c ? `${c.firstName} ${c.lastName}` : "Customer" };
}

async function getCustomerProfile(id: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      vehicles: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      jobs: {
        where: { deletedAt: null },
        include: {
          assignments: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
            where: { isLead: true },
            take: 1,
          },
          vehicle: { select: { year: true, make: true, model: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      estimates: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { vehicle: { select: { year: true, make: true, model: true } } },
      },
      invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      appointments: { orderBy: { startsAt: "desc" }, take: 10 },
      communicationLogs: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { id: true, fullName: true } } },
      },
    },
  });
  return customer;
}

async function getCustomerMetrics(customerId: string, organizationId: string) {
  const [payments, outstandingInvoices] = await Promise.all([
    prisma.payment.aggregate({
      where: { customerId, organizationId, status: "SUCCEEDED" },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: {
        customerId, organizationId,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _sum: { balanceCents: true },
      _count: true,
    }),
  ]);

  return {
    lifetimeRevenueCents: payments._sum.amountCents ?? 0,
    outstandingBalanceCents: outstandingInvoices._sum.balanceCents ?? 0,
    overdueInvoices: outstandingInvoices._count,
    paymentCount: payments._count,
  };
}

async function getTimeline(customerId: string, organizationId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/customers/${customerId}/timeline`,
    { headers: { Cookie: "" }, cache: "no-store" }
  ).catch(() => null);

  // Build timeline server-side directly if fetch fails (avoids round-trip in dev)
  const [jobs, estimates, invoices, payments, appointments, vehicles, comms] =
    await Promise.all([
      prisma.job.findMany({ where: { customerId, organizationId, deletedAt: null }, select: { id: true, jobNumber: true, title: true, completedAt: true, createdAt: true, totalCents: true }, orderBy: { createdAt: "desc" } }),
      prisma.estimate.findMany({ where: { customerId, organizationId }, select: { id: true, estimateNumber: true, title: true, sentAt: true, approvedAt: true, declinedAt: true, createdAt: true, totalCents: true }, orderBy: { createdAt: "desc" } }),
      prisma.invoice.findMany({ where: { customerId, organizationId }, select: { id: true, invoiceNumber: true, sentAt: true, paidAt: true, createdAt: true, totalCents: true }, orderBy: { createdAt: "desc" } }),
      prisma.payment.findMany({ where: { customerId, organizationId, status: "SUCCEEDED" }, select: { id: true, amountCents: true, method: true, processedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.appointment.findMany({ where: { customerId, organizationId }, select: { id: true, title: true, startsAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.vehicle.findMany({ where: { customerId, organizationId, deletedAt: null }, select: { id: true, year: true, make: true, model: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      prisma.communicationLog.findMany({ where: { customerId, organizationId }, select: { id: true, type: true, subject: true, body: true, direction: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { createdAt: true, firstName: true, lastName: true } });
  const events: any[] = [];

  if (customer) events.push({ id: `created-${customerId}`, type: "customer_created", title: "Customer profile created", subtitle: `${customer.firstName} ${customer.lastName} added`, timestamp: customer.createdAt, icon: "UserPlus", color: "blue" });
  for (const v of vehicles) events.push({ id: `v-${v.id}`, type: "vehicle_added", title: "Vehicle added", subtitle: `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim(), timestamp: v.createdAt, icon: "Car", color: "slate" });
  for (const j of jobs) {
    events.push({ id: `jc-${j.id}`, type: "job_created", title: "Job created", subtitle: `${j.jobNumber} — ${j.title}`, timestamp: j.createdAt, metadata: { jobId: j.id }, icon: "Wrench", color: "blue" });
    if (j.completedAt) events.push({ id: `jd-${j.id}`, type: "job_completed", title: "Job completed", subtitle: `${j.jobNumber} — ${j.title}`, timestamp: j.completedAt, metadata: { totalCents: j.totalCents }, icon: "CheckCircle", color: "green" });
  }
  for (const e of estimates) {
    events.push({ id: `ec-${e.id}`, type: "estimate_created", title: "Estimate created", subtitle: `${e.estimateNumber} — ${e.title}`, timestamp: e.createdAt, icon: "FileText", color: "slate" });
    if (e.sentAt) events.push({ id: `es-${e.id}`, type: "estimate_sent", title: "Estimate sent", subtitle: e.estimateNumber, timestamp: e.sentAt, icon: "Send", color: "blue" });
    if (e.approvedAt) events.push({ id: `ea-${e.id}`, type: "estimate_approved", title: "Estimate approved", subtitle: e.estimateNumber, timestamp: e.approvedAt, icon: "ThumbsUp", color: "green" });
    if (e.declinedAt) events.push({ id: `ed-${e.id}`, type: "estimate_declined", title: "Estimate declined", subtitle: e.estimateNumber, timestamp: e.declinedAt, icon: "ThumbsDown", color: "red" });
  }
  for (const inv of invoices) {
    if (inv.sentAt) events.push({ id: `is-${inv.id}`, type: "invoice_sent", title: "Invoice sent", subtitle: `${inv.invoiceNumber} — ${formatCents(inv.totalCents)}`, timestamp: inv.sentAt, icon: "Receipt", color: "blue" });
    if (inv.paidAt) events.push({ id: `ip-${inv.id}`, type: "invoice_paid", title: "Invoice paid", subtitle: `${inv.invoiceNumber} — ${formatCents(inv.totalCents)}`, timestamp: inv.paidAt, icon: "DollarSign", color: "green" });
  }
  for (const p of payments) events.push({ id: `p-${p.id}`, type: "payment_received", title: "Payment received", subtitle: `${formatCents(p.amountCents)} via ${p.method.toLowerCase()}`, timestamp: p.processedAt ?? p.createdAt, icon: "CreditCard", color: "green" });
  for (const a of appointments) events.push({ id: `a-${a.id}`, type: "appointment_booked", title: "Appointment scheduled", subtitle: a.title, timestamp: a.createdAt, icon: "Calendar", color: "purple" });
  for (const c of comms) events.push({ id: `c-${c.id}`, type: `communication_${c.type}`, title: c.type === "note" ? "Note added" : `${c.type} logged`, subtitle: c.subject || c.body?.slice(0, 60), timestamp: c.createdAt, icon: "MessageSquare", color: "slate" });

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events;
}

const PREFERRED_CONTACT_LABELS: Record<string, string> = {
  phone: "Phone", email: "Email", sms: "SMS / Text",
};

const TAG_COLORS: Record<string, string> = {
  vip: "bg-yellow-100 text-yellow-800 border-yellow-200",
  fleet: "bg-blue-100 text-blue-800 border-blue-200",
  commercial: "bg-purple-100 text-purple-800 border-purple-200",
  repeat: "bg-green-100 text-green-800 border-green-200",
};

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;

  const [customer, metrics, timeline] = await Promise.all([
    getCustomerProfile(id, user.organizationId),
    getCustomerMetrics(id, user.organizationId),
    getTimeline(id, user.organizationId),
  ]);

  if (!customer) notFound();

  const fullName = `${customer.firstName} ${customer.lastName}`;
  const hasAddress = customer.addressLine1 || customer.city;
  const addressLine = [
    customer.addressLine1,
    customer.addressLine2,
    [customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
  ].filter(Boolean).join(", ");

  const avgInvoice = customer.invoices.length > 0
    ? Math.round(customer.invoices.reduce((s, i) => s + i.totalCents, 0) / customer.invoices.length)
    : 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title={fullName}
        subtitle={customer.companyName ?? (customer.isCommercial ? "Commercial account" : "Customer")}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <Link href={`/customers/${id}/edit`}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
            <Button size="sm" asChild className="gap-1.5">
              <Link href={`/jobs/new?customerId=${id}`}>
                <Plus className="h-3.5 w-3.5" /> New job
              </Link>
            </Button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6">

          {/* Sticky profile header */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Top bar */}
            <div className="flex items-start gap-5 p-6 border-b border-border">
              <Avatar className="h-14 w-14 flex-shrink-0">
                <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
                  {getInitials(fullName)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl font-semibold text-foreground">{fullName}</h1>
                  {customer.isCommercial && (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  )}
                  {customer.doNotContact && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <AlertCircle className="h-3 w-3" /> Do not contact
                    </Badge>
                  )}
                </div>

                {customer.companyName && (
                  <p className="text-sm text-muted-foreground mb-2">{customer.companyName}</p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {customer.tags.map((tag) => (
                    <span key={tag}
                      className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                        TAG_COLORS[tag.toLowerCase()] ?? "bg-muted text-muted-foreground border-border")}>
                      {tag}
                    </span>
                  ))}
                  {customer.source && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border text-muted-foreground bg-muted">
                      via {customer.source}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground text-right flex-shrink-0">
                <p>Customer since</p>
                <p className="font-medium text-foreground">{formatDate(customer.createdAt)}</p>
              </div>
            </div>

            {/* Contact grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-b border-border">
              {customer.phonePrimary && (
                <a href={`tel:${customer.phonePrimary}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Primary</p>
                    <p className="text-sm font-medium truncate">{customer.phonePrimary}</p>
                  </div>
                </a>
              )}
              {customer.phoneSecondary && (
                <a href={`tel:${customer.phoneSecondary}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Secondary</p>
                    <p className="text-sm font-medium truncate">{customer.phoneSecondary}</p>
                  </div>
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Email</p>
                    <p className="text-sm font-medium truncate">{customer.email}</p>
                  </div>
                </a>
              )}
              {hasAddress && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(addressLine)}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      Address <ExternalLink className="h-2.5 w-2.5" />
                    </p>
                    <p className="text-sm font-medium truncate">{addressLine}</p>
                  </div>
                </a>
              )}
            </div>

            {/* Preferred contact */}
            {customer.preferredContact && (
              <div className="px-4 py-2.5 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Preferred contact:</span>
                <Badge variant="secondary" className="text-xs">
                  {PREFERRED_CONTACT_LABELS[customer.preferredContact] ?? customer.preferredContact}
                </Badge>
              </div>
            )}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: "Lifetime revenue", value: formatCents(metrics.lifetimeRevenueCents), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
              { label: "Outstanding", value: formatCents(metrics.outstandingBalanceCents), icon: CreditCard, color: metrics.outstandingBalanceCents > 0 ? "text-destructive" : "text-muted-foreground", bg: metrics.outstandingBalanceCents > 0 ? "bg-destructive/5" : "bg-muted" },
              { label: "Jobs completed", value: customer.jobs.filter((j) => ["COMPLETED", "INVOICED", "CLOSED"].includes(j.status)).length.toString(), icon: Wrench, color: "text-primary", bg: "bg-primary/5" },
              { label: "Avg invoice", value: formatCents(avgInvoice), icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Last service", value: customer.lastServiceAt ? formatDate(customer.lastServiceAt, { month: "short", day: "numeric" }) : "Never", icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
              { label: "Vehicles", value: customer.vehicles.length.toString(), icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={cn("h-6 w-6 rounded flex items-center justify-center", m.bg)}>
                      <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-semibold text-foreground tabular-nums">{m.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Notes (if any) */}
          {customer.notes && (
            <div className="rounded-xl border border-border bg-amber-50/50 border-amber-200/80 p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1 uppercase tracking-wide">Internal notes</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-6">
              <CustomerProfileTabs
                customerId={id}
                jobs={customer.jobs}
                estimates={customer.estimates}
                invoices={customer.invoices}
                appointments={customer.appointments}
                vehicles={customer.vehicles}
                communications={customer.communicationLogs as any}
                timeline={timeline}
              />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
