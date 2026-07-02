import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { CustomerListClient } from "@/components/customers/customer-list-client";

export const metadata: Metadata = { title: "Customers" };

async function getInitialCustomers(organizationId: string) {
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        vehicles: {
          where: { deletedAt: null },
          select: { id: true, year: true, make: true, model: true },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { jobs: { where: { deletedAt: null } }, invoices: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.customer.count({ where: { organizationId, deletedAt: null } }),
  ]);

  const customerIds = customers.map((c) => c.id);
  const balances = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds }, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
    _sum: { balanceCents: true },
  });
  const balanceMap = new Map(balances.map((b) => [b.customerId, b._sum.balanceCents ?? 0]));

  return {
    customers: customers.map((c) => ({
      ...c,
      outstandingBalanceCents: balanceMap.get(c.id) ?? 0,
    })),
    total,
  };
}

export default async function CustomersPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const { customers, total } = await getInitialCustomers(user.organizationId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="Customers" subtitle={`${total} total`} />
      <main className="flex-1 overflow-y-auto p-6">
        <CustomerListClient
          initialCustomers={customers as any}
          initialTotal={total}
        />
      </main>
    </div>
  );
}
