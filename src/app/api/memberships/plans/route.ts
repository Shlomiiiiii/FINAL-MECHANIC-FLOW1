import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";
import { stripe } from "@/lib/stripe";

const benefitSchema = z.object({
  id:           z.string().min(1),
  type:         z.enum(["free_service","labor_discount","parts_discount","service_discount","flat_credit","included_service","priority_scheduling","loyalty_bonus","custom"]),
  name:         z.string().min(1).max(200),
  description:  z.string().optional(),
  serviceType:  z.string().optional(),
  limitType:    z.enum(["unlimited","per_period","one_time"]),
  limitValue:   z.number().int().optional(),
  interval:     z.enum(["month","year","lifetime"]).optional(),
  discountPct:  z.number().min(0).max(100).optional(),
  discountCents: z.number().int().min(0).optional(),
  maxValueCents: z.number().int().optional(),
  isHighlighted: z.boolean().optional(),
});

const planSchema = z.object({
  name:                 z.string().min(1).max(200),
  slug:                 z.string().min(1).max(100).regex(/^[a-z0-9-]+$/,"Slug must be lowercase letters, numbers, and hyphens"),
  description:          z.string().max(2000).optional(),
  color:                z.string().optional(),
  icon:                 z.string().optional(),
  tier:                 z.number().int().min(0).optional().default(0),
  monthlyPriceCents:    z.number().int().min(0),
  yearlyPriceCents:     z.number().int().min(0).optional().default(0),
  enrollmentFeeCents:   z.number().int().min(0).optional().default(0),
  cancellationFeeCents: z.number().int().min(0).optional().default(0),
  trialDays:            z.number().int().min(0).optional().default(0),
  maxVehicles:          z.number().int().min(1).optional().default(1),
  maxMembers:           z.number().int().min(1).optional().default(1),
  taxable:              z.boolean().optional().default(true),
  status:               z.enum(["active","paused","archived"]).optional().default("active"),
  isPublic:             z.boolean().optional().default(true),
  sortOrder:            z.number().int().optional().default(0),
  benefits:             z.array(benefitSchema).optional().default([]),
  loyaltyPointsPerDollar: z.number().int().min(0).optional().default(0),
  notes:                z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const includeArchived = searchParams.get("includeArchived") === "true";

    const plans = await prisma.membershipPlan.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status } : includeArchived ? {} : { status: { not: "archived" } }),
      },
      include: {
        _count: { select: { memberships: { where: { status: { in: ["active","trialing"] } } } } },
      },
      orderBy: [{ tier: "asc" }, { sortOrder: "asc" }, { monthlyPriceCents: "asc" }],
    });

    return successResponse({ plans });
  } catch (err) {
    console.error("GET /api/memberships/plans:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = planSchema.safeParse(body);

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

    // Slug uniqueness check
    const slugConflict = await prisma.membershipPlan.findFirst({
      where: { organizationId: user.organizationId, slug: data.slug },
    });
    if (slugConflict) return ApiErrors.conflict(`A plan with slug "${data.slug}" already exists.`);

    // Create Stripe product if the shop has a connected account
    const connectAccount = await prisma.stripeConnectAccount.findUnique({
      where: { organizationId: user.organizationId },
      select: { stripeAccountId: true, chargesEnabled: true },
    });

    let stripeProductId: string | undefined;
    let stripePriceIdMonthly: string | undefined;
    let stripePriceIdYearly: string | undefined;

    if (connectAccount?.chargesEnabled && data.monthlyPriceCents > 0) {
      try {
        const product = await stripe.products.create(
          {
            name: `${data.name} Membership`,
            description: data.description ?? undefined,
            metadata: { organizationId: user.organizationId, planSlug: data.slug },
          },
          { stripeAccount: connectAccount.stripeAccountId }
        );
        stripeProductId = product.id;

        const monthlyPrice = await stripe.prices.create(
          {
            product: product.id,
            currency: "usd",
            unit_amount: data.monthlyPriceCents,
            recurring: { interval: "month" },
            nickname: `${data.name} Monthly`,
            metadata: { planSlug: data.slug, interval: "month" },
          },
          { stripeAccount: connectAccount.stripeAccountId }
        );
        stripePriceIdMonthly = monthlyPrice.id;

        if (data.yearlyPriceCents > 0) {
          const yearlyPrice = await stripe.prices.create(
            {
              product: product.id,
              currency: "usd",
              unit_amount: data.yearlyPriceCents,
              recurring: { interval: "year" },
              nickname: `${data.name} Yearly`,
              metadata: { planSlug: data.slug, interval: "year" },
            },
            { stripeAccount: connectAccount.stripeAccountId }
          );
          stripePriceIdYearly = yearlyPrice.id;
        }
      } catch (stripeErr: any) {
        console.error("Stripe product creation failed:", stripeErr.message);
        // Continue without Stripe — can be set up later
      }
    }

    const plan = await prisma.membershipPlan.create({
      data: {
        organizationId:       user.organizationId,
        name:                 data.name,
        slug:                 data.slug,
        description:          data.description,
        color:                data.color,
        icon:                 data.icon,
        tier:                 data.tier ?? 0,
        monthlyPriceCents:    data.monthlyPriceCents,
        yearlyPriceCents:     data.yearlyPriceCents ?? 0,
        enrollmentFeeCents:   data.enrollmentFeeCents ?? 0,
        cancellationFeeCents: data.cancellationFeeCents ?? 0,
        trialDays:            data.trialDays ?? 0,
        maxVehicles:          data.maxVehicles ?? 1,
        maxMembers:           data.maxMembers ?? 1,
        taxable:              data.taxable ?? true,
        status:               data.status ?? "active",
        isPublic:             data.isPublic ?? true,
        sortOrder:            data.sortOrder ?? 0,
        benefits:             data.benefits as any,
        loyaltyPointsPerDollar: data.loyaltyPointsPerDollar ?? 0,
        notes:                data.notes,
        stripeProductId,
        stripePriceIdMonthly,
        stripePriceIdYearly,
      },
      include: { _count: { select: { memberships: true } } },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId:         user.id,
        action:         "CREATED",
        resourceType:   "membership_plan",
        resourceId:     plan.id,
        metadata:       { name: plan.name } as any,
      },
    });

    return successResponse({ plan }, 201);
  } catch (err) {
    console.error("POST /api/memberships/plans:", err);
    return ApiErrors.internal();
  }
}
