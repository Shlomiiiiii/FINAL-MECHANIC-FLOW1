import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { InvoicePortalClient } from "@/components/payments/invoice-portal-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your Invoice" };

export default async function InvoicePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { paymentLinkToken: token },
    include: {
      customer: { select: { firstName: true, lastName: true, email: true, phonePrimary: true } },
      vehicle:  { select: { year: true, make: true, model: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { where: { status: "SUCCEEDED" }, orderBy: { processedAt: "desc" } },
      organization: {
        select: {
          name: true, phone: true, email: true, taxLabel: true,
          invoiceTerms: true, stripeAccountOnboarded: true,
        },
      },
    },
  });

  if (!invoice) notFound();

  // Track view (fire and forget)
  prisma.invoiceView.create({ data: { invoiceId: invoice.id } }).catch(() => {});
  if (!["VIEWED","PARTIALLY_PAID","PAID","CANCELLED"].includes(invoice.status)) {
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VIEWED", viewedAt: new Date() } }).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <InvoicePortalClient invoice={invoice as any} token={token} />
    </div>
  );
}
