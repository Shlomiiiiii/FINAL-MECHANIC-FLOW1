import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { CustomerForm } from "@/components/customers/customer-form";

export const metadata: Metadata = { title: "Edit Customer" };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!customer) notFound();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Edit Customer"
        subtitle={`${customer.firstName} ${customer.lastName}`}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <CustomerForm
            mode="edit"
            customerId={customer.id}
            defaultValues={{
              firstName: customer.firstName,
              lastName: customer.lastName,
              companyName: customer.companyName ?? "",
              isCommercial: customer.isCommercial,
              email: customer.email ?? "",
              phonePrimary: customer.phonePrimary ?? "",
              phoneSecondary: customer.phoneSecondary ?? "",
              preferredContact: customer.preferredContact,
              addressLine1: customer.addressLine1 ?? "",
              addressLine2: customer.addressLine2 ?? "",
              city: customer.city ?? "",
              state: customer.state ?? "",
              zip: customer.zip ?? "",
              source: (customer.source as any) ?? "",
              tags: customer.tags,
              notes: customer.notes ?? "",
              doNotContact: customer.doNotContact,
            }}
          />
        </div>
      </main>
    </div>
  );
}
