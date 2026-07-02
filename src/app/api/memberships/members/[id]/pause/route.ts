import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const membership = await prisma.customerMembership.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!membership) return ApiErrors.notFound("Membership");

    const body = await request.json().catch(() => ({}));
    const isPausing = membership.status !== "paused";
    const resumesAt = body.resumesAt ? new Date(body.resumesAt) : undefined;

    // Pause/resume on Stripe
    if (membership.stripeSubscriptionId) {
      const connect = await prisma.stripeConnectAccount.findUnique({
        where: { organizationId: user.organizationId },
        select: { stripeAccountId: true },
      });
      if (connect) {
        try {
          if (isPausing) {
            await stripe.subscriptions.update(
              membership.stripeSubscriptionId,
              { pause_collection: { behavior: "void", resumes_at: resumesAt ? Math.floor(resumesAt.getTime() / 1000) : undefined } },
              { stripeAccount: connect.stripeAccountId }
            );
          } else {
            await stripe.subscriptions.update(
              membership.stripeSubscriptionId,
              { pause_collection: "" as any },
              { stripeAccount: connect.stripeAccountId }
            );
          }
        } catch (e: any) { console.error("Stripe pause error:", e.message); }
      }
    }

    const now = new Date();
    const updated = await prisma.customerMembership.update({
      where: { id },
      data: {
        status:    isPausing ? "paused" : "active",
        pausedAt:  isPausing ? now : null,
        resumesAt: isPausing ? (resumesAt ?? null) : null,
      },
    });

    await prisma.membershipEvent.create({
      data: {
        membershipId:   id,
        organizationId: user.organizationId,
        eventType:      isPausing ? "paused" : "resumed",
        description:    isPausing ? `Membership paused${resumesAt ? ` until ${resumesAt.toLocaleDateString()}` : ""}` : "Membership resumed",
        performedById:  user.id,
      },
    });

    return successResponse({ membership: updated });
  } catch (err) {
    console.error("POST /pause:", err);
    return ApiErrors.internal();
  }
}
