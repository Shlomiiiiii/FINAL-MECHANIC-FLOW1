import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Topbar } from "@/components/layout/topbar";
import { CustomerForm } from "@/components/customers/customer-form";

export const metadata: Metadata = { title: "New Customer" };

export default async function NewCustomerPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="New Customer" subtitle="Add a customer to your CRM" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <CustomerForm mode="create" />
        </div>
      </main>
    </div>
  );
}
