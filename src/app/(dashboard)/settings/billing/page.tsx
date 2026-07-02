import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { BillingDashboard } from "@/components/payments/billing-dashboard";

export const metadata: Metadata = { title: "Billing & Payments" };

export default async function BillingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["OWNER","MANAGER"].includes(user.role)) redirect("/dashboard");

  const [org, subscription, connectAccount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { plan: true, stripeCustomerId: true, stripeAccountId: true, stripeAccountOnboarded: true, trialEndsAt: true },
    }),
    prisma.subscription.findUnique({
      where: { organizationId: user.organizationId },
    }),
    prisma.stripeConnectAccount.findUnique({
      where: { organizationId: user.organizationId },
      select: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="Billing & Payments" subtitle="Manage your plan and Stripe connection" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <BillingDashboard
            currentPlan={org?.plan ?? "STARTER"}
            subscription={subscription ? {
              status:            subscription.status,
              currentPeriodEnd:  subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              amountCents:       subscription.amountCents,
              interval:          subscription.interval,
              trialEnd:          subscription.trialEnd,
            } : null}
            connectStatus={{
              connected:      !!org?.stripeAccountId,
              onboarded:      org?.stripeAccountOnboarded ?? false,
              chargesEnabled: connectAccount?.chargesEnabled ?? false,
            }}
            userRole={user.role}
          />
        </div>
      </main>
    </div>
  );
}
