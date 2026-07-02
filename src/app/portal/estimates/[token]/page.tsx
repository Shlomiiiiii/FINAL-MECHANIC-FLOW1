import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CustomerPortalClient } from "@/components/estimates/customer-portal-client";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  return { title: "View Your Estimate" };
}

export default async function EstimatePortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token: estimateId } = await params;
  const sp = await searchParams;
  const customerToken = sp.token;

  // Validate customer owns this estimate via portal token
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId },
    include: {
      customer: {
        select: {
          firstName: true,
          lastName: true,
          portalToken: true,
        },
      },
      vehicle: { select: { year: true, make: true, model: true, trim: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      organization: {
        select: {
          name: true,
          phone: true,
          email: true,
          logoUrl: true,
          invoiceTerms: true,
          taxLabel: true,
        },
      },
    },
  });

  if (!estimate) notFound();

  // Require customer portal token to view
  if (customerToken && estimate.customer.portalToken !== customerToken) {
    notFound();
  }

  // Record view (fire and forget)
  prisma.estimateView.create({
    data: { estimateId: estimateId },
  }).catch(() => {});

  // Mark viewedAt on first view
  if (!estimate.viewedAt) {
    prisma.estimate.update({
      where: { id: estimateId },
      data: { viewedAt: new Date() },
    }).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <CustomerPortalClient estimate={estimate as any} estimateId={estimateId} />
    </div>
  );
}
