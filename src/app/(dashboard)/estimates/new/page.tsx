import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { EstimateBuilder } from "@/components/estimates/estimate-builder";

export const metadata: Metadata = { title: "New Estimate" };

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string; jobId?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "TECHNICIAN") redirect("/dashboard");

  const sp = await searchParams;

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { taxRatePct: true, laborRateCents: true, taxLabel: true, invoiceTerms: true },
  });

  if (!sp.customerId) redirect("/customers");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="New Estimate" subtitle="Build and send an estimate" />
      <main className="flex-1 overflow-y-auto p-6">
        <EstimateBuilder
          mode="create"
          customerId={sp.customerId}
          vehicleId={sp.vehicleId}
          jobId={sp.jobId}
          organization={{
            taxRatePct: Number(org?.taxRatePct ?? 0),
            laborRateCents: org?.laborRateCents ?? 0,
            taxLabel: org?.taxLabel ?? "Tax",
            invoiceTerms: org?.invoiceTerms,
          }}
        />
      </main>
    </div>
  );
}
