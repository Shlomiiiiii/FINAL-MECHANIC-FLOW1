import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { MemberBadge } from "@/components/memberships/member-badge";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ status?: string; planId?: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;

  const members = await prisma.customerMembership.findMany({
    where: {
      organizationId: user.organizationId,
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.planId  ? { planId:  sp.planId  } : {}),
    },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true } },
      plan:     { select: { id: true, name: true, color: true, tier: true, monthlyPriceCents: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
  const STATUS_VARIANT: Record<string, any> = {
    active: "success", trialing: "info", past_due: "warning",
    paused: "secondary", cancelled: "destructive",
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="Members" subtitle={`${members.length} memberships`} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-[1fr_140px_120px_100px_100px_100px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Customer</span><span>Plan</span><span>Status</span><span>Billing</span><span>Started</span><span>Renews</span>
          </div>
          <div className="divide-y divide-border">
            {members.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No members found.</div>
            ) : members.map((m) => (
              <Link key={m.id} href={`/memberships/members/${m.id}`}
                className="grid grid-cols-[1fr_140px_120px_100px_100px_100px] gap-3 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.customer.firstName} {m.customer.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.customer.email}</p>
                </div>
                <span className="text-sm font-medium truncate" style={{ color: m.plan.color ?? "#3b82f6" }}>{m.plan.name}</span>
                <Badge variant={STATUS_VARIANT[m.status] ?? "secondary"} className="text-[10px] py-0 w-fit">
                  {m.status.replace("_"," ")}
                </Badge>
                <span className="text-sm tabular-nums text-muted-foreground">{fmt(m.amountCents)}/{m.billingInterval === "year" ? "yr" : "mo"}</span>
                <span className="text-xs text-muted-foreground">{new Date(m.startedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})}</span>
                <span className="text-xs text-muted-foreground">{new Date(m.currentPeriodEnd).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
