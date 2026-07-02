import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { PortalLayout } from "@/components/portal/portal-layout";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-blue-50 text-blue-700", VIEWED: "bg-blue-50 text-blue-700",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700", OVERDUE: "bg-red-50 text-red-700",
  PAID: "bg-green-50 text-green-700", CANCELLED: "bg-slate-100 text-slate-500",
};

export default async function PortalInvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getPortalSession(slug);
  if (!session) redirect(`/portal/${slug}/login`);

  const [invoices, org, customer] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: session.customerId, organizationId: session.organizationId, status: { notIn: ["DRAFT","ARCHIVED"] } },
      include: { vehicle: { select: { year: true, make: true, model: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true, logoUrl: true, portalAllowBooking: true, portalAllowChat: true, portalAllowPhotoUpload: true } }),
    prisma.customer.findUnique({ where: { id: session.customerId }, select: { firstName: true, lastName: true } }),
  ]);

  if (!org || !customer) redirect(`/portal/${slug}/login`);
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const totalOwed = invoices.filter(i => !["PAID","CANCELLED"].includes(i.status)).reduce((s, i) => s + i.balanceCents, 0);

  return (
    <PortalLayout slug={slug} customerName={`${customer.firstName} ${customer.lastName}`}
      orgName={org.name} orgLogo={org.logoUrl}
      allowBooking={org.portalAllowBooking} allowChat={org.portalAllowChat} allowPhotos={org.portalAllowPhotoUpload}>
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Invoices</h1>
          {totalOwed > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-full text-sm font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> {fmt(totalOwed)} due
            </div>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No invoices yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map(inv => (
              <Link key={inv.id} href={`/portal/${slug}/invoices/${inv.id}`}
                className="flex items-center gap-4 bg-white rounded-2xl border border-slate-100 px-5 py-4 hover:border-primary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm">{inv.invoiceNumber}</p>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_STYLE[inv.status] ?? "bg-slate-100 text-slate-500")}>
                      {inv.status.replace("_"," ")}
                    </span>
                  </div>
                  {inv.vehicle && <p className="text-xs text-slate-400">{inv.vehicle.year} {inv.vehicle.make} {inv.vehicle.model}</p>}
                  <p className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-slate-900">{fmt(inv.totalCents)}</p>
                  {inv.balanceCents > 0 && inv.balanceCents !== inv.totalCents && (
                    <p className="text-xs text-red-600">{fmt(inv.balanceCents)} due</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
