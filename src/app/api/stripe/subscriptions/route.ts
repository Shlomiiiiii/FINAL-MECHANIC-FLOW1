/**
 * MechanicFlow Subscription Management
 * Creates/retrieves Stripe subscription for the platform billing.
 */

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stripe, PLANS } from "@/lib/stripe";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(_request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: user.organizationId },
    });

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { plan: true, stripeCustomerId: true, trialEndsAt: true },
    });

    return successResponse({
      subscription,
      currentPlan: org?.plan ?? "STARTER",
      plans: Object.values(PLANS),
      trialEndsAt: org?.trialEndsAt,
    });
  } catch (err) {
    console.error("GET /stripe/subscriptions:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role !== "OWNER") return ApiErrors.forbidden();

    const body = await request.json();
    const { planId, interval, couponCode } = body as {
      planId: string;
      interval: "month" | "year";
      couponCode?: string;
    };

    const plan = PLANS[planId];
    if (!plan) return ApiErrors.validation({ planId: ["Invalid plan"] });

    const priceId = interval === "year" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    if (!priceId) {
      return ApiErrors.businessLogic(`Stripe price not configured for ${plan.name} ${interval}. Set STRIPE_PRICE_${planId}_${interval.toUpperCase()} in env.`);
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, email: true, stripeCustomerId: true },
    });
    if (!org) return ApiErrors.notFound("Organization");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // Get or create Stripe Customer
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: org.email ?? undefined,
        name: org.name,
        metadata: { organizationId: org.id },
      });
      stripeCustomerId = customer.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId },
      });
    }

    // Check for existing subscription
    const existingSub = await prisma.subscription.findUnique({
      where: { organizationId: org.id },
      select: { stripeSubscriptionId: true, status: true },
    });

    if (existingSub && ["active","trialing"].includes(existingSub.status)) {
      // Update existing subscription (upgrade/downgrade)
      const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
      const updated = await stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { organizationId: org.id },
      });

      return successResponse({ subscription: updated, action: "updated" });
    }

    // Create Stripe Checkout Session for new subscription
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { organizationId: org.id },
        ...(couponCode ? { coupon: couponCode } : {}),
      },
      success_url: `${appUrl}/settings/billing?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/settings/billing?subscription=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_update: { address: "auto" },
    });

    return successResponse({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error("POST /stripe/subscriptions:", err);
    if (err?.type?.startsWith("Stripe")) return ApiErrors.businessLogic(err.message);
    return ApiErrors.internal();
  }
}
