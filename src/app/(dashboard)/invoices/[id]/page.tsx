import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { InvoiceDetailClient } from "@/components/invoices/invoice-detail-client";
import { formatCents, formatDate, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  User, Car, Wrench, Receipt, TrendingUp, Clock,
  Shield, Eye, ExternalLink, Edit, Printer,
} from "lucide-react";
import type { InvoiceStatus } from "@prisma/client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { invoiceNumber: true } });
  return { title: inv?.invoiceNumber ?? "Invoice" };
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true, portalToken: true, addressLine1: true, city: true, state: true, zip: true } },
      vehicle:  { select: { id: true, year: true, make: true, model: true, trim: true, vin: true, licensePlate: true, mileageLastSeen: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { fullName: true } } } },
      createdBy: { select: { id: true, fullName: true } },
      views:    { orderBy: { viewedAt: "desc" }, take: 5 },
      events:   { orderBy: { createdAt: "desc" }, take: 20 },
      job:      { select: { id: true, jobNumber: true, title: true } },
      organization: { select: { name: true, phone: true, email: true, taxLabel: true, invoiceTerms: true } },
    },
  });
  if (!invoice) notFound();

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portalUrl = `${appUrl}/portal/invoices/${invoice.paymentLinkToken}`;
  const pdfUrl    = `/api/invoices/${id}/pdf`;

  const vehicleStr = invoice.vehicle
    ? `${invoice.vehicle.year ?? ""} ${invoice.vehicle.make ?? ""} ${invoice.vehicle.model ?? ""}`.trim()
    : null;

  // Group line items by category
  const grouped: Record<string, typeof invoice.lineItems> = {};
  for (const li of invoice.lineItems) {
    const cat = li.category ?? "Services";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(li);
  }

  const laborItems  = invoice.lineItems.filter((li) => li.itemType === "LABOR");
  const totalHours  = laborItems.reduce((s, li) => s + Number(li.laborHours ?? 0), 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title={invoice.invoiceNumber}
        subtitle={`${invoice.customer.firstName} ${invoice.customer.lastName}`}
        actions={
          <InvoiceDetailClient
            invoice={invoice as any}
            portalUrl={portalUrl}
            pdfUrl={pdfUrl}
            userRole={user.role}
          />
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">

          {/* Status header */}
          <div className={cn("rounded-xl border p-4 flex items-center gap-3",
            invoice.status === "PAID"           ? "bg-green-50 border-green-200" :
            invoice.status === "OVERDUE"        ? "bg-red-50 border-red-200" :
            invoice.status === "PARTIALLY_PAID" ? "bg-amber-50 border-amber-200" :
            "bg-muted border-border"
          )}>
            <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
            <div className="flex-1 flex items-center gap-4 text-sm">
              <span>Total: <strong className="tabular-nums">{formatCents(invoice.totalCents)}</strong></span>
              {invoice.amountPaidCents > 0 && (
                <span className="text-green-700">Paid: <strong className="tabular-nums">{formatCents(invoice.amountPaidCents)}</strong></span>
              )}
              {invoice.balanceCents > 0 && (
                <span className={invoice.status === "OVERDUE" ? "text-destructive" : "text-muted-foreground"}>
                  Balance: <strong className="tabular-nums">{formatCents(invoice.balanceCents)}</strong>
                </span>
              )}
            </div>
            {invoice.views.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                Viewed {invoice.views.length}×
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left — main content */}
            <div className="lg:col-span-2 space-y-5">

              {/* Customer + Vehicle */}
              <Card>
                <CardContent className="p-5">
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <User className="h-3 w-3" /> Customer
                      </p>
                      <Link href={`/customers/${invoice.customer.id}`} className="text-sm font-semibold text-primary hover:underline">
                        {invoice.customer.firstName} {invoice.customer.lastName}
                      </Link>
                      {invoice.customer.phonePrimary && <p className="text-xs text-muted-foreground mt-0.5">{invoice.customer.phonePrimary}</p>}
                      {invoice.customer.email && <p className="text-xs text-muted-foreground">{invoice.customer.email}</p>}
                    </div>
                    {invoice.vehicle && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Car className="h-3 w-3" /> Vehicle
                        </p>
                        <Link href={`/vehicles/${invoice.vehicle.id}`} className="text-sm font-semibold text-primary hover:underline">
                          {vehicleStr}
                        </Link>
                        {invoice.vehicle.licensePlate && <p className="text-xs text-muted-foreground mt-0.5">Plate: {invoice.vehicle.licensePlate}</p>}
                        {invoice.vehicle.vin && <p className="text-xs font-mono text-muted-foreground">VIN: {invoice.vehicle.vin}</p>}
                      </div>
                    )}
                  </div>
                  {invoice.job && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <Wrench className="h-3 w-3" /> Job
                      </p>
                      <Link href={`/jobs/${invoice.job.id}`} className="text-sm text-primary hover:underline">
                        {invoice.job.jobNumber} — {invoice.job.title}
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line items */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold mb-4">Line items</h3>
                  <div className="space-y-5">
                    {Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</p>
                        <div className="space-y-2">
                          {items.map((li) => (
                            <div key={li.id} className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">{li.description}</p>
                                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                                  {Number(li.quantity) !== 1 && <span>Qty: {Number(li.quantity)}</span>}
                                  {li.laborHours && <span>{Number(li.laborHours).toFixed(1)}h</span>}
                                  {li.warranty && <span className="text-green-600 flex items-center gap-1"><Shield className="h-2.5 w-2.5" />{li.warranty}</span>}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                {Number(li.quantity) !== 1 && <p className="text-xs text-muted-foreground">{Number(li.quantity)} × {formatCents(li.unitPriceCents)}</p>}
                                <p className="text-sm font-semibold tabular-nums">{formatCents(li.totalCents)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Totals */}
                    <div className="border-t border-border pt-4 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{formatCents(invoice.subtotalCents)}</span>
                      </div>
                      {invoice.discountCents > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount</span><span className="tabular-nums">-{formatCents(invoice.discountCents)}</span>
                        </div>
                      )}
                      {invoice.taxCents > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{invoice.organization.taxLabel ?? "Tax"}</span>
                          <span className="tabular-nums">{formatCents(invoice.taxCents)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-base border-t border-border pt-2">
                        <span>Total</span><span className="tabular-nums">{formatCents(invoice.totalCents)}</span>
                      </div>
                      {invoice.amountPaidCents > 0 && (
                        <>
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Paid</span><span className="tabular-nums">-{formatCents(invoice.amountPaidCents)}</span>
                          </div>
                          <div className={cn("flex justify-between font-bold",
                            invoice.balanceCents > 0 ? "text-destructive" : "text-green-600")}>
                            <span>Balance Due</span><span className="tabular-nums">{formatCents(invoice.balanceCents)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payments recorded */}
              {invoice.payments.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold mb-4">Payments ({invoice.payments.length})</h3>
                    <div className="space-y-2">
                      {invoice.payments.map((pmt) => (
                        <div key={pmt.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                          <div>
                            <p className="text-sm font-medium">{formatCents(pmt.amountCents)}</p>
                            <p className="text-xs text-muted-foreground">
                              {pmt.method.toLowerCase().replace("_"," ")} · {pmt.processedAt ? formatDate(pmt.processedAt) : formatDate(pmt.createdAt)} · {pmt.createdBy.fullName}
                            </p>
                          </div>
                          <Badge variant="success" className="text-[10px]">
                            {pmt.status === "REFUNDED" ? "Refunded" : "Received"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Notes + terms */}
              {(invoice.notes || invoice.warrantyText || invoice.terms) && (
                <div className="space-y-3">
                  {invoice.warrantyText && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-2">
                      <Shield className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">Warranty</p>
                        <p className="text-sm text-green-800">{invoice.warrantyText}</p>
                      </div>
                    </div>
                  )}
                  {invoice.notes && (
                    <div className="rounded-lg border border-border bg-amber-50/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              {/* Timeline */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Timeline</p>
                  <div className="space-y-3">
                    {invoice.events.slice(0, 10).map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2 text-xs">
                        <div className="h-4 w-4 rounded-full bg-muted flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize text-foreground">{ev.eventType.replace(/_/g," ")}</p>
                          {ev.note && <p className="text-muted-foreground truncate">{ev.note}</p>}
                          <p className="text-muted-foreground">{formatDateTime(ev.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Portal link */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer portal</p>
                  <p className="text-xs text-muted-foreground break-all bg-muted rounded p-2 font-mono">{portalUrl}</p>
                  <a href={portalUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> Preview portal
                  </a>
                </CardContent>
              </Card>

              {/* Meta */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{formatDate(invoice.createdAt)}</span>
                    </div>
                    {invoice.dueDate && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Due date</span>
                        <span className={cn(
                          invoice.balanceCents > 0 && new Date(invoice.dueDate) < new Date()
                            ? "text-destructive font-medium" : ""
                        )}>{formatDate(invoice.dueDate)}</span>
                      </div>
                    )}
                    {invoice.sentAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sent</span>
                        <span>{formatDate(invoice.sentAt)}</span>
                      </div>
                    )}
                    {invoice.paidAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="text-green-600">{formatDate(invoice.paidAt)}</span>
                      </div>
                    )}
                    {invoice.poNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PO #</span>
                        <span className="font-mono">{invoice.poNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created by</span>
                      <span>{invoice.createdBy.fullName}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
