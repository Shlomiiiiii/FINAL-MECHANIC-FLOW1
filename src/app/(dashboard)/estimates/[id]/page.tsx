import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EstimateActions } from "@/components/estimates/estimate-actions";
import {
  Edit, FileText, Car, User, Eye, Calendar, Shield,
  TrendingUp, CheckCircle, Clock, XCircle,
} from "lucide-react";
import { formatCents, formatDate, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = await prisma.estimate.findUnique({ where: { id }, select: { estimateNumber: true } });
  return { title: e?.estimateNumber ?? "Estimate" };
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"; icon: any; description: string }> = {
  DRAFT: { label: "Draft", variant: "secondary", icon: FileText, description: "Not yet sent" },
  SENT: { label: "Sent", variant: "info", icon: Clock, description: "Awaiting customer response" },
  APPROVED: { label: "Approved", variant: "success", icon: CheckCircle, description: "Customer approved" },
  DECLINED: { label: "Declined", variant: "destructive", icon: XCircle, description: "Customer declined" },
  EXPIRED: { label: "Expired", variant: "outline", icon: Clock, description: "Estimate expired" },
  CONVERTED: { label: "Converted to job", variant: "success", icon: CheckCircle, description: "Estimate converted" },
};

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;

  const estimate = await prisma.estimate.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true, portalToken: true } },
      vehicle: { select: { id: true, year: true, make: true, model: true, trim: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { fullName: true } },
      views: { orderBy: { viewedAt: "desc" }, take: 5 },
      job: { select: { id: true, jobNumber: true, status: true } },
    },
  });
  if (!estimate) notFound();

  const statusCfg = STATUS_CONFIG[estimate.status] ?? STATUS_CONFIG.DRAFT;
  const StatusIcon = statusCfg.icon;
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/estimates/${id}?token=${estimate.customer.portalToken}`;

  // Group line items by category
  const categories = [...new Set(estimate.lineItems.map(li => li.category ?? "Services"))];
  const grouped: Record<string, typeof estimate.lineItems> = {};
  for (const li of estimate.lineItems) {
    const cat = li.category ?? "Services";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(li);
  }

  const laborItems = estimate.lineItems.filter(li => li.itemType === "LABOR");
  const partItems = estimate.lineItems.filter(li => li.itemType === "PART");
  const totalLaborHours = laborItems.reduce((s, li) => s + Number(li.laborHours ?? 0), 0);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title={estimate.estimateNumber}
        subtitle={estimate.title}
        actions={
          <div className="flex items-center gap-2">
            {!["APPROVED","CONVERTED"].includes(estimate.status) && (
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <Link href={`/estimates/${id}/edit`}><Edit className="h-3.5 w-3.5" /> Edit</Link>
              </Button>
            )}
            <EstimateActions estimate={estimate as any} portalUrl={portalUrl} userRole={user.role} />
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* Status banner */}
          <div className={cn("rounded-xl border p-4 flex items-center gap-3",
            estimate.status === "APPROVED" || estimate.status === "CONVERTED" ? "bg-green-50 border-green-200" :
            estimate.status === "DECLINED" ? "bg-red-50 border-red-200" :
            estimate.status === "SENT" ? "bg-blue-50 border-blue-200" :
            "bg-muted border-border"
          )}>
            <StatusIcon className={cn("h-5 w-5 flex-shrink-0",
              estimate.status === "APPROVED" || estimate.status === "CONVERTED" ? "text-green-600" :
              estimate.status === "DECLINED" ? "text-red-600" :
              estimate.status === "SENT" ? "text-blue-600" : "text-muted-foreground"
            )} />
            <div className="flex-1">
              <p className="text-sm font-semibold">{statusCfg.label}</p>
              <p className="text-xs text-muted-foreground">{statusCfg.description}</p>
            </div>
            {estimate.status === "SENT" && estimate.views.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                Viewed {estimate.views.length}× · last {formatDateTime(estimate.views[0].viewedAt)}
              </div>
            )}
            {estimate.status === "APPROVED" && estimate.approvedByName && (
              <div className="text-xs text-green-700">
                By {estimate.approvedByName} · {estimate.approvedAt ? formatDate(estimate.approvedAt) : ""}
              </div>
            )}
            {estimate.job && (
              <Link href={`/jobs/${estimate.job.id}`} className="text-xs text-primary hover:underline">
                Job {estimate.job.jobNumber} →
              </Link>
            )}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Estimate total", value: formatCents(estimate.totalCents), icon: TrendingUp, color: "text-primary", bg: "bg-primary/5" },
              { label: "Labor hours", value: totalLaborHours > 0 ? `${totalLaborHours.toFixed(1)}h` : "—", icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Parts", value: String(partItems.length), icon: FileText, color: "text-green-600", bg: "bg-green-50" },
              { label: "Views", value: String(estimate.views.length), icon: Eye, color: "text-muted-foreground", bg: "bg-muted" },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", m.bg)}>
                    <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{m.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-5">

              {/* Customer & Vehicle */}
              <Card>
                <CardContent className="p-5">
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <User className="h-3 w-3" /> Customer
                      </p>
                      <Link href={`/customers/${estimate.customer.id}`} className="text-sm font-semibold text-primary hover:underline">
                        {estimate.customer.firstName} {estimate.customer.lastName}
                      </Link>
                      {estimate.customer.phonePrimary && (
                        <p className="text-xs text-muted-foreground mt-0.5">{estimate.customer.phonePrimary}</p>
                      )}
                      {estimate.customer.email && (
                        <p className="text-xs text-muted-foreground">{estimate.customer.email}</p>
                      )}
                    </div>
                    {estimate.vehicle && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Car className="h-3 w-3" /> Vehicle
                        </p>
                        <Link href={`/vehicles/${estimate.vehicle.id}`} className="text-sm font-semibold text-primary hover:underline">
                          {estimate.vehicle.year} {estimate.vehicle.make} {estimate.vehicle.model}
                        </Link>
                        {estimate.vehicle.trim && (
                          <p className="text-xs text-muted-foreground mt-0.5">{estimate.vehicle.trim}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Line items */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold mb-4">Services &amp; Parts</h3>
                  <div className="space-y-5">
                    {Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</p>
                        <div className="space-y-2">
                          {items.map((li) => (
                            <div key={li.id} className="flex items-start gap-3 justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">{li.description}</p>
                                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                                  {Number(li.quantity) !== 1 && <span>Qty: {Number(li.quantity)}</span>}
                                  {li.laborHours && <span>{Number(li.laborHours).toFixed(1)}h labor</span>}
                                  {li.warranty && <span className="text-green-600 flex items-center gap-1"><Shield className="h-2.5 w-2.5" />{li.warranty}</span>}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                {Number(li.quantity) !== 1 && (
                                  <p className="text-xs text-muted-foreground">{Number(li.quantity)} × {formatCents(li.unitPriceCents)}</p>
                                )}
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
                        <span className="tabular-nums">{formatCents(estimate.subtotalCents)}</span>
                      </div>
                      {estimate.discountCents > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount</span>
                          <span className="tabular-nums">-{formatCents(estimate.discountCents)}</span>
                        </div>
                      )}
                      {estimate.taxCents > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Tax</span>
                          <span className="tabular-nums">{formatCents(estimate.taxCents)}</span>
                        </div>
                      )}
                      {estimate.depositCents > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Deposit</span>
                          <span className="tabular-nums text-muted-foreground">-{formatCents(estimate.depositCents)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                        <span>Total</span>
                        <span className="tabular-nums">{formatCents(estimate.totalCents)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {(estimate.notes || estimate.warrantyText) && (
                <div className="space-y-3">
                  {estimate.warrantyText && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-2">
                      <Shield className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-1">Warranty</p>
                        <p className="text-sm text-green-800">{estimate.warrantyText}</p>
                      </div>
                    </div>
                  )}
                  {estimate.notes && (
                    <div className="rounded-lg border border-border bg-amber-50/50 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{estimate.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Timeline */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Timeline</p>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-start gap-2">
                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><FileText className="h-2.5 w-2.5 text-muted-foreground" /></div>
                      <div><p className="font-medium">Created</p><p className="text-muted-foreground">{formatDateTime(estimate.createdAt)}</p><p className="text-muted-foreground">by {estimate.createdBy.fullName}</p></div>
                    </div>
                    {estimate.sentAt && (
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Clock className="h-2.5 w-2.5 text-blue-600" /></div>
                        <div><p className="font-medium text-blue-700">Sent</p><p className="text-muted-foreground">{formatDateTime(estimate.sentAt)}</p></div>
                      </div>
                    )}
                    {estimate.viewedAt && (
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><Eye className="h-2.5 w-2.5 text-muted-foreground" /></div>
                        <div><p className="font-medium">First viewed</p><p className="text-muted-foreground">{formatDateTime(estimate.viewedAt)}</p></div>
                      </div>
                    )}
                    {estimate.approvedAt && (
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"><CheckCircle className="h-2.5 w-2.5 text-green-600" /></div>
                        <div><p className="font-medium text-green-700">Approved</p><p className="text-muted-foreground">{formatDateTime(estimate.approvedAt)}</p>{estimate.approvedByName && <p className="text-muted-foreground">by {estimate.approvedByName}</p>}</div>
                      </div>
                    )}
                    {estimate.declinedAt && (
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><XCircle className="h-2.5 w-2.5 text-red-600" /></div>
                        <div><p className="font-medium text-red-700">Declined</p><p className="text-muted-foreground">{formatDateTime(estimate.declinedAt)}</p>{estimate.declineReason && <p className="text-muted-foreground italic">"{estimate.declineReason}"</p>}</div>
                      </div>
                    )}
                    {estimate.expiresAt && (
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><Calendar className="h-2.5 w-2.5 text-muted-foreground" /></div>
                        <div><p className="font-medium">Expires</p><p className="text-muted-foreground">{formatDate(estimate.expiresAt)}</p></div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Change request */}
              {estimate.changeRequestNote && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Change requested</p>
                    <p className="text-sm text-amber-900">{estimate.changeRequestNote}</p>
                    {estimate.changeRequestedAt && (
                      <p className="text-xs text-amber-700 mt-1">{formatDateTime(estimate.changeRequestedAt)}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Portal link */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Customer portal link</p>
                  <p className="text-xs text-muted-foreground break-all bg-muted rounded p-2 font-mono">{portalUrl}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
