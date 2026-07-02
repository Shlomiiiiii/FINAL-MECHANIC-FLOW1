import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { validatePromoCode, getMembershipStripeMetadata } from "@/lib/memberships";
import { computePlatformFee } from "@/lib/stripe";

const enrollSchema = z.object({
  customerId:      z.string().min(1),
  planId:          z.string().min(1),
  billingInterval: z.enum(["month","year"]).default("month"),
  vehicleIds:      z.array(z.string()).optional().default([]),
  promoCode:       z.string().optional(),
  internalNotes:   z.string().optional(),
  startBillingNow: z.boolean().optional().default(true),
  // If false: create record without Stripe (manual / cash membership)
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const status     = searchParams.get("status");
    const planId     = searchParams.get("planId");
    const search     = searchParams.get("search")?.trim() ?? "";
    const cursor     = searchParams.get("cursor");
    const limit      = Math.min(parseInt(searchParams.get("limit") ?? "25"), 100);

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (status) where.status = status;
    if (planId) where.planId = planId;
    if (search) {
      where.customer = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName:  { contains: search, mode: "insensitive" } },
          { email:     { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [members, total] = await Promise.all([
      prisma.customerMembership.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true } },
          plan:     { select: { id: true, name: true, color: true, tier: true, monthlyPriceCents: true } },
        },
        orderBy: { startedAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.customerMembership.count({ where }),
    ]);

    const hasMore = members.length > limit;
    const data    = hasMore ? members.slice(0, -1) : members;

    return successResponse({
      members: data,
      pagination: { cursor: hasMore ? data.at(-1)?.id ?? null : null, hasMore, total },
    });
  } catch (err) {
    console.error("GET /api/memberships/members:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = enrollSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;

    // Check no active membership already exists
    const existing = await prisma.customerMembership.findFirst({
      where: { customerId: data.customerId, organizationId: user.organizationId, status: { in: ["active","trialing","past_due","paused"] } },
    });
    if (existing) {
      return ApiErrors.conflict("Customer already has an active membership. Cancel or upgrade the existing one.");
    }

    const plan = await prisma.membershipPlan.findFirst({
      where: { id: data.planId, organizationId: user.organizationId, status: "active" },
    });
    if (!plan) return ApiErrors.notFound("Membership plan");

    // Validate promo code
    let discountPct = 0;
    let discountCents = 0;
    let promoCodeRecord: any = null;

    if (data.promoCode) {
      const result = await validatePromoCode(data.promoCode, user.organizationId, data.planId, data.customerId);
      if (!result.valid) return ApiErrors.businessLogic(result.error ?? "Invalid promo code");
      promoCodeRecord = result.promo;
      if (promoCodeRecord.discountType === "pct") discountPct = promoCodeRecord.discountPct;
      if (promoCodeRecord.discountType === "flat") discountCents = promoCodeRecord.discountCents;
    }

    const priceId = data.billingInterval === "year" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    const amountCents = data.billingInterval === "year" ? plan.yearlyPriceCents : plan.monthlyPriceCents;

    const now = new Date();
    let stripeSubscriptionId: string | undefined;
    let stripeCustomerId: string | undefined;

    // Stripe billing
    if (data.startBillingNow && priceId) {
      const connect = await prisma.stripeConnectAccount.findUnique({
        where: { organizationId: user.organizationId },
        select: { stripeAccountId: true, chargesEnabled: true },
      });

      if (connect?.chargesEnabled) {
        // Get or create Stripe customer for this customer
        const customer = await prisma.customer.findUnique({
          where: { id: data.customerId },
          select: { email: true, firstName: true, lastName: true },
        });

        const stripeCustomerRecord = await prisma.stripeCustomer.findFirst({
          where: { organizationId: user.organizationId, customerId: data.customerId },
        });

        if (stripeCustomerRecord) {
          stripeCustomerId = stripeCustomerRecord.stripeCustomerId;
        } else if (customer?.email) {
          const sc = await stripe.customers.create(
            {
              email: customer.email,
              name: `${customer.firstName} ${customer.lastName}`,
              metadata: getMembershipStripeMetadata({
                organizationId: user.organizationId,
                customerId: data.customerId,
                planId: data.planId,
              }) as any,
            },
            { stripeAccount: connect.stripeAccountId }
          );
          stripeCustomerId = sc.id;
          await prisma.stripeCustomer.create({
            data: {
              organizationId: user.organizationId,
              customerId: data.customerId,
              stripeCustomerId: sc.id,
              email: customer.email,
              name: `${customer.firstName} ${customer.lastName}`,
            },
          });
        }

        if (stripeCustomerId) {
          const platformFee = computePlatformFee(amountCents);
          const sub = await stripe.subscriptions.create(
            {
              customer: stripeCustomerId,
              items: [{ price: priceId }],
              trial_period_days: plan.trialDays > 0 ? plan.trialDays : undefined,
              application_fee_percent: 0.5,
              metadata: getMembershipStripeMetadata({
                organizationId: user.organizationId,
                customerId: data.customerId,
                planId: data.planId,
              }) as any,
            },
            { stripeAccount: connect.stripeAccountId }
          );
          stripeSubscriptionId = sub.id;
        }
      }
    }

    // Increment promo code usage
    if (promoCodeRecord) {
      await prisma.membershipPromoCode.update({
        where: { id: promoCodeRecord.id },
        data: { redemptionCount: { increment: 1 } },
      });
    }

    const trialEnd = plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86400000) : null;
    const periodEnd = data.billingInterval === "year"
      ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const membership = await prisma.$transaction(async (tx) => {
      const m = await tx.customerMembership.create({
        data: {
          organizationId:   user.organizationId,
          customerId:       data.customerId,
          planId:           data.planId,
          status:           plan.trialDays > 0 ? "trialing" : "active",
          stripeSubscriptionId,
          stripeCustomerId,
          stripePriceId:    priceId ?? undefined,
          billingInterval:  data.billingInterval,
          amountCents,
          startedAt:        now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialStart:       plan.trialDays > 0 ? now : undefined,
          trialEnd:         trialEnd ?? undefined,
          vehicleIds:       data.vehicleIds,
          promoCode:        data.promoCode?.toUpperCase(),
          discountPct,
          discountCents,
          internalNotes:    data.internalNotes,
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          plan:     { select: { id: true, name: true, color: true } },
        },
      });

      await tx.membershipEvent.create({
        data: {
          membershipId:   m.id,
          organizationId: user.organizationId,
          eventType:      "created",
          description:    `Enrolled in ${plan.name}${plan.trialDays > 0 ? ` with ${plan.trialDays}-day trial` : ""}`,
          metadata:       { planId: data.planId, interval: data.billingInterval, promoCode: data.promoCode } as any,
          performedById:  user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId:         user.id,
          action:         "CREATED",
          resourceType:   "customer_membership",
          resourceId:     m.id,
          metadata:       { customerId: data.customerId, planId: data.planId } as any,
        },
      });

      return m;
    });

    return successResponse({ membership }, 201);
  } catch (err: any) {
    console.error("POST /api/memberships/members:", err);
    if (err?.type?.startsWith("Stripe")) return ApiErrors.businessLogic(err.message);
    return ApiErrors.internal();
  }
}
