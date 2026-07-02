import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role !== "OWNER") return ApiErrors.forbidden();

    const body = await request.json().catch(() => ({}));
    const { immediately = false } = body as { immediately?: boolean };

    const sub = await prisma.subscription.findUnique({
      where: { organizationId: user.organizationId },
      select: { stripeSubscriptionId: true, status: true },
    });

    if (!sub || !["active","trialing","past_due"].includes(sub.status)) {
      return ApiErrors.businessLogic("No active subscription to cancel.");
    }

    if (immediately) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } else {
      // Cancel at period end (user keeps access until billing cycle ends)
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    await prisma.subscription.update({
      where: { organizationId: user.organizationId },
      data: { cancelAtPeriodEnd: !immediately, canceledAt: immediately ? new Date() : null },
    });

    return successResponse({
      cancelled: true,
      immediately,
      message: immediately
        ? "Subscription cancelled immediately. Access ends now."
        : "Subscription will cancel at the end of the current billing period.",
    });
  } catch (err: any) {
    console.error("POST /stripe/subscriptions/cancel:", err);
    if (err?.type?.startsWith("Stripe")) return ApiErrors.businessLogic(err.message);
    return ApiErrors.internal();
  }
}
