import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const membership = await prisma.customerMembership.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { plan: { select: { name: true } } },
    });
    if (!membership) return ApiErrors.notFound("Membership");
    if (!["active","trialing"].includes(membership.status)) {
      return ApiErrors.businessLogic("Can only upgrade an active or trialing membership.");
    }

    const body = await request.json();
    const { newPlanId, billingInterval } = body as { newPlanId: string; billingInterval?: string };

    const newPlan = await prisma.membershipPlan.findFirst({
      where: { id: newPlanId, organizationId: user.organizationId, status: "active" },
    });
    if (!newPlan) return ApiErrors.notFound("New plan");
    if (newPlanId === membership.planId) return ApiErrors.businessLogic("Already on this plan.");

    const newInterval = billingInterval ?? membership.billingInterval;
    const newPriceId  = newInterval === "year" ? newPlan.stripePriceIdYearly : newPlan.stripePriceIdMonthly;
    const newAmount   = newInterval === "year" ? newPlan.yearlyPriceCents     : newPlan.monthlyPriceCents;

    // Swap on Stripe
    if (membership.stripeSubscriptionId && newPriceId) {
      const connect = await prisma.stripeConnectAccount.findUnique({
        where: { organizationId: user.organizationId },
        select: { stripeAccountId: true },
      });
      if (connect) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            membership.stripeSubscriptionId,
            { stripeAccount: connect.stripeAccountId } as any
          );
          await stripe.subscriptions.update(
            membership.stripeSubscriptionId,
            {
              items: [{ id: (sub as any).items.data[0].id, price: newPriceId }],
              proration_behavior: "create_prorations",
            },
            { stripeAccount: connect.stripeAccountId }
          );
        } catch (e: any) { console.error("Stripe upgrade error:", e.message); }
      }
    }

    const isUpgrade = newPlan.tier > (membership as any).plan.tier;
    const eventType = isUpgrade ? "upgraded" : "downgraded";

    const updated = await prisma.customerMembership.update({
      where: { id },
      data: {
        planId:          newPlanId,
        stripePriceId:   newPriceId ?? undefined,
        billingInterval: newInterval,
        amountCents:     newAmount,
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        plan:     { select: { name: true, color: true } },
      },
    });

    await prisma.membershipEvent.create({
      data: {
        membershipId:   id,
        organizationId: user.organizationId,
        eventType,
        description:    `${eventType === "upgraded" ? "Upgraded" : "Downgraded"} from ${membership.plan.name} to ${newPlan.name}`,
        metadata:       { fromPlanId: membership.planId, toPlanId: newPlanId } as any,
        performedById:  user.id,
      },
    });

    return successResponse({ membership: updated });
  } catch (err) {
    console.error("POST /upgrade:", err);
    return ApiErrors.internal();
  }
}
