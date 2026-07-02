import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Topbar } from "@/components/layout/topbar";

export const metadata: Metadata = { title: "New Invoice" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; estimateId?: string; customerId?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "TECHNICIAN") redirect("/dashboard");

  const sp = await searchParams;

  // If converting from job/estimate, redirect to conversion endpoint via client
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="New Invoice" subtitle="Create an invoice" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto text-center py-16">
          <h2 className="text-lg font-semibold mb-2">Create an invoice</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Choose how to create your invoice:
          </p>
          <div className="grid gap-3 max-w-sm mx-auto">
            <a href="/jobs?selectForInvoice=1"
              className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 text-left transition-colors">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="font-medium text-sm">From a completed job</p>
                <p className="text-xs text-muted-foreground">Convert job line items to invoice</p>
              </div>
            </a>
            <a href="/estimates?selectForInvoice=1"
              className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 text-left transition-colors">
              <span className="text-2xl">📋</span>
              <div>
                <p className="font-medium text-sm">From an approved estimate</p>
                <p className="text-xs text-muted-foreground">Convert estimate to invoice instantly</p>
              </div>
            </a>
            <a href="/customers"
              className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 text-left transition-colors">
              <span className="text-2xl">✏️</span>
              <div>
                <p className="font-medium text-sm">Manual invoice</p>
                <p className="text-xs text-muted-foreground">Select a customer and build from scratch</p>
              </div>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
