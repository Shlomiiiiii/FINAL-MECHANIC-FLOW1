import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { stripe } from "@/lib/stripe";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const plan = await prisma.membershipPlan.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        memberships: {
          where: { status: { in: ["active","trialing","past_due"] } },
          include: { customer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { startedAt: "desc" },
          take: 20,
        },
        _count: { select: { memberships: true } },
      },
    });

    if (!plan) return ApiErrors.notFound("Plan");
    return successResponse({ plan });
  } catch (err) {
    console.error("GET plan:", err);
    return ApiErrors.internal();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const plan = await prisma.membershipPlan.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!plan) return ApiErrors.notFound("Plan");

    const body = await request.json();
    const allowedFields = ["name","description","color","icon","tier","status","isPublic",
      "sortOrder","benefits","notes","enrollmentFeeCents","cancellationFeeCents",
      "trialDays","maxVehicles","maxMembers","taxable","loyaltyPointsPerDollar"];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) updateData[key] = body[key];
    }

    // Don't allow price changes if active members exist — Stripe can't update recurring prices
    if (("monthlyPriceCents" in body || "yearlyPriceCents" in body)) {
      const activeCount = await prisma.customerMembership.count({
        where: { planId: id, status: { in: ["active","trialing"] } },
      });
      if (activeCount > 0) {
        return ApiErrors.businessLogic(
          `Cannot change prices on a plan with ${activeCount} active members. Create a new plan instead.`
        );
      }
      if ("monthlyPriceCents" in body) updateData.monthlyPriceCents = body.monthlyPriceCents;
      if ("yearlyPriceCents"  in body) updateData.yearlyPriceCents  = body.yearlyPriceCents;
    }

    // Sync name to Stripe if changed
    if (body.name && plan.stripeProductId) {
      const connect = await prisma.stripeConnectAccount.findUnique({
        where: { organizationId: user.organizationId },
        select: { stripeAccountId: true },
      });
      if (connect) {
        try {
          await stripe.products.update(plan.stripeProductId,
            { name: `${body.name} Membership` },
            { stripeAccount: connect.stripeAccountId }
          );
        } catch { /* non-fatal */ }
      }
    }

    const updated = await prisma.membershipPlan.update({
      where: { id },
      data: updateData,
    });

    return successResponse({ plan: updated });
  } catch (err) {
    console.error("PATCH plan:", err);
    return ApiErrors.internal();
  }
}
