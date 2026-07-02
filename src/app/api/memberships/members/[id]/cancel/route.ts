import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const membership = await prisma.customerMembership.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { plan: { select: { name: true, cancellationFeeCents: true } } },
    });
    if (!membership) return ApiErrors.notFound("Membership");
    if (membership.status === "cancelled") return ApiErrors.businessLogic("Already cancelled.");

    const body = await request.json().catch(() => ({}));
    const { immediately = false, reason = "" } = body as { immediately?: boolean; reason?: string };

    // Cancel on Stripe
    if (membership.stripeSubscriptionId) {
      const connect = await prisma.stripeConnectAccount.findUnique({
        where: { organizationId: user.organizationId },
        select: { stripeAccountId: true },
      });
      if (connect) {
        try {
          if (immediately) {
            await stripe.subscriptions.cancel(
              membership.stripeSubscriptionId,
              { stripeAccount: connect.stripeAccountId } as any
            );
          } else {
            await stripe.subscriptions.update(
              membership.stripeSubscriptionId,
              { cancel_at_period_end: true },
              { stripeAccount: connect.stripeAccountId }
            );
          }
        } catch (e: any) { console.error("Stripe cancel error:", e.message); }
      }
    }

    const now = new Date();
    const updated = await prisma.customerMembership.update({
      where: { id },
      data: {
        status:           immediately ? "cancelled" : membership.status,
        cancelAtPeriodEnd: !immediately,
        cancelledAt:      immediately ? now : undefined,
        cancelReason:     reason || undefined,
      },
    });

    await prisma.membershipEvent.create({
      data: {
        membershipId:   id,
        organizationId: user.organizationId,
        eventType:      "cancelled",
        description:    immediately
          ? `Membership cancelled immediately${reason ? `: ${reason}` : ""}`
          : `Membership set to cancel at period end${reason ? `: ${reason}` : ""}`,
        metadata:       { immediately, reason } as any,
        performedById:  user.id,
      },
    });

    return successResponse({ membership: updated });
  } catch (err) {
    console.error("POST /cancel:", err);
    return ApiErrors.internal();
  }
}
