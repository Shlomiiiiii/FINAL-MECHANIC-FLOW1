/**
 * MechanicFlow Membership Engine
 *
 * Core business logic for the membership & service plan system.
 * All benefit evaluation, discount application, and redemption tracking.
 */

import { prisma } from "@/lib/db";
import type { CustomerMembership, MembershipPlan } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BenefitType =
  | "free_service"       // Unlimited or N free instances of a service per period
  | "labor_discount"     // % off labor
  | "parts_discount"     // % off parts
  | "service_discount"   // % off a specific service type
  | "flat_credit"        // $ credit per period
  | "included_service"   // One-time or recurring included service
  | "priority_scheduling"// No dollar value, feature flag
  | "loyalty_bonus"      // Extra loyalty point multiplier
  | "custom";            // Freeform benefit

export type BenefitLimitType = "unlimited" | "per_period" | "one_time";
export type BenefitInterval  = "month" | "year" | "lifetime";

export interface PlanBenefit {
  id: string;            // unique key within plan (e.g. "oil-change")
  type: BenefitType;
  name: string;          // "Free Oil Change"
  description?: string;
  serviceType?: string;  // maps to appointment/job type
  limitType: BenefitLimitType;
  limitValue?: number;   // how many per period (null = unlimited)
  interval?: BenefitInterval;
  discountPct?: number;  // 0-100
  discountCents?: number;
  maxValueCents?: number;// cap on flat credit redemptions
  isHighlighted?: boolean;// shown prominently in plan card
}

export interface BenefitStatus {
  benefit: PlanBenefit;
  used: number;
  remaining: number | "unlimited";
  isAvailable: boolean;
  periodStart: Date;
  periodEnd: Date;
  nextResetAt: Date | null;
}

export interface MembershipCheckResult {
  hasMembership: boolean;
  membership: CustomerMembership | null;
  plan: MembershipPlan | null;
  benefits: BenefitStatus[];
  availableDiscounts: ApplicableDiscount[];
  loyaltyBalance: number;
}

export interface ApplicableDiscount {
  type: "labor_pct" | "parts_pct" | "flat_credit" | "service_free";
  value: number;   // pct or cents
  benefitId: string;
  description: string;
}

// ─── Plan benefit helpers ─────────────────────────────────────────────────────

export function parsePlanBenefits(plan: MembershipPlan): PlanBenefit[] {
  try {
    const raw = plan.benefits as any[];
    if (!Array.isArray(raw)) return [];
    return raw.filter(b => b.id && b.type && b.name);
  } catch {
    return [];
  }
}

export function getPlanDisplayColor(plan: MembershipPlan): string {
  if (plan.color) return plan.color;
  const tierColors = ["#b45309","#64748b","#d97706","#1d4ed8","#7c3aed"];
  return tierColors[plan.tier % tierColors.length] ?? "#3b82f6";
}

// ─── Benefit usage calculation ────────────────────────────────────────────────

/**
 * Calculate how many times a benefit has been used this period for a membership.
 */
export async function getBenefitUsageForPeriod(
  membershipId: string,
  benefitKey: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const result = await prisma.membershipBenefitUsage.aggregate({
    where: {
      membershipId,
      benefitKey,
      periodStart: { gte: periodStart },
      periodEnd:   { lte: periodEnd },
    },
    _sum: { quantityUsed: true },
  });
  return Number(result._sum.quantityUsed ?? 0);
}

/**
 * Get full benefit status for an active membership.
 */
export async function getMembershipBenefitStatus(
  membership: CustomerMembership,
  plan: MembershipPlan
): Promise<BenefitStatus[]> {
  const benefits = parsePlanBenefits(plan);
  const periodStart = membership.currentPeriodStart;
  const periodEnd   = membership.currentPeriodEnd;

  const statuses: BenefitStatus[] = await Promise.all(
    benefits.map(async (benefit) => {
      let used = 0;
      let remaining: number | "unlimited" = "unlimited";
      let isAvailable = true;

      if (benefit.limitType === "per_period" && benefit.limitValue !== undefined) {
        used = await getBenefitUsageForPeriod(membership.id, benefit.id, periodStart, periodEnd);
        remaining = Math.max(0, benefit.limitValue - used);
        isAvailable = remaining > 0;
      } else if (benefit.limitType === "one_time") {
        used = await prisma.membershipBenefitUsage.count({
          where: { membershipId: membership.id, benefitKey: benefit.id },
        });
        remaining = Math.max(0, 1 - used);
        isAvailable = remaining > 0;
      } else {
        // unlimited
        isAvailable = true;
      }

      return {
        benefit,
        used,
        remaining,
        isAvailable,
        periodStart,
        periodEnd,
        nextResetAt: benefit.limitType === "per_period" ? periodEnd : null,
      };
    })
  );

  return statuses;
}

// ─── Main membership check (called when creating a job) ──────────────────────

/**
 * Check a customer's membership and return all applicable benefits & discounts.
 * Called when a technician opens a job — results shown immediately in the UI.
 */
export async function checkCustomerMembership(
  customerId: string,
  organizationId: string
): Promise<MembershipCheckResult> {
  const empty: MembershipCheckResult = {
    hasMembership: false,
    membership: null,
    plan: null,
    benefits: [],
    availableDiscounts: [],
    loyaltyBalance: 0,
  };

  // Find active membership
  const membership = await prisma.customerMembership.findFirst({
    where: {
      customerId,
      organizationId,
      status: { in: ["active", "trialing", "past_due"] }, // past_due still gets benefits during grace period
    },
    include: { plan: true },
    orderBy: { startedAt: "desc" },
  });

  if (!membership) return empty;

  // Check grace period for past_due
  if (membership.status === "past_due" && membership.gracePeriodEndsAt) {
    if (new Date() > membership.gracePeriodEndsAt) {
      return empty; // grace expired
    }
  }

  const plan = membership.plan;
  const benefits = await getMembershipBenefitStatus(membership, plan);

  // Build applicable discounts from available benefits
  const discounts: ApplicableDiscount[] = [];
  for (const bs of benefits) {
    if (!bs.isAvailable) continue;
    const b = bs.benefit;

    if (b.type === "labor_discount" && b.discountPct) {
      discounts.push({
        type: "labor_pct",
        value: b.discountPct,
        benefitId: b.id,
        description: `${b.discountPct}% labor discount (${plan.name} member)`,
      });
    }
    if (b.type === "parts_discount" && b.discountPct) {
      discounts.push({
        type: "parts_pct",
        value: b.discountPct,
        benefitId: b.id,
        description: `${b.discountPct}% parts discount (${plan.name} member)`,
      });
    }
    if (b.type === "flat_credit" && b.discountCents) {
      discounts.push({
        type: "flat_credit",
        value: b.discountCents,
        benefitId: b.id,
        description: `$${(b.discountCents / 100).toFixed(2)} credit (${b.name})`,
      });
    }
    if ((b.type === "free_service" || b.type === "included_service") && bs.isAvailable) {
      discounts.push({
        type: "service_free",
        value: 0,
        benefitId: b.id,
        description: `${b.name} included — ${typeof bs.remaining === "number" ? `${bs.remaining} remaining` : "unlimited"}`,
      });
    }
  }

  // Loyalty balance
  const loyaltyTx = await prisma.loyaltyTransaction.aggregate({
    where: { customerId, organizationId },
    _sum: { points: true },
  });

  return {
    hasMembership: true,
    membership,
    plan,
    benefits,
    availableDiscounts: discounts,
    loyaltyBalance: Math.max(0, loyaltyTx._sum.points ?? 0),
  };
}

// ─── Benefit redemption ───────────────────────────────────────────────────────

/**
 * Record benefit usage when a job is completed.
 */
export async function redeemBenefit(params: {
  membershipId: string;
  organizationId: string;
  benefitId: string;
  benefitName: string;
  quantity?: number;
  valueCents?: number;
  jobId?: string;
  invoiceId?: string;
  appliedById?: string;
  notes?: string;
}): Promise<void> {
  const membership = await prisma.customerMembership.findUnique({
    where: { id: params.membershipId },
    select: { currentPeriodStart: true, currentPeriodEnd: true },
  });
  if (!membership) throw new Error("Membership not found");

  await prisma.membershipBenefitUsage.create({
    data: {
      membershipId:   params.membershipId,
      organizationId: params.organizationId,
      benefitKey:     params.benefitId,
      benefitName:    params.benefitName,
      periodStart:    membership.currentPeriodStart,
      periodEnd:      membership.currentPeriodEnd,
      quantityUsed:   params.quantity ?? 1,
      valueCents:     params.valueCents ?? 0,
      jobId:          params.jobId,
      invoiceId:      params.invoiceId,
      appliedById:    params.appliedById,
      notes:          params.notes,
    },
  });

  // Log event
  await prisma.membershipEvent.create({
    data: {
      membershipId:   params.membershipId,
      organizationId: params.organizationId,
      eventType:      "benefit_redeemed",
      description:    `${params.benefitName} redeemed${params.jobId ? ` on job` : ""}`,
      metadata: {
        benefitId: params.benefitId,
        quantity:  params.quantity ?? 1,
        valueCents: params.valueCents ?? 0,
        jobId:     params.jobId,
      } as any,
      performedById: params.appliedById,
    },
  });

  // Update membership totals
  await prisma.customerMembership.update({
    where: { id: params.membershipId },
    data: {
      totalSavedCents: { increment: params.valueCents ?? 0 },
      totalJobsOnPlan: { increment: params.jobId ? 1 : 0 },
    },
  });
}

// ─── MRR / Analytics ──────────────────────────────────────────────────────────

export interface MembershipAnalytics {
  mrrCents: number;
  arrCents: number;
  activeMembers: number;
  trialMembers: number;
  cancelledThisMonth: number;
  churnRate: number;
  avgLifetimeCents: number;
  topPlan: { name: string; count: number } | null;
  newThisMonth: number;
  renewalsThisMonth: number;
}

export async function getMembershipAnalytics(organizationId: string): Promise<MembershipAnalytics> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [active, trials, cancelledThisMonth, allPlanCounts, newThisMonth, renewalPayments] = await Promise.all([
    prisma.customerMembership.aggregate({
      where: { organizationId, status: "active" },
      _count: true,
      _sum:   { amountCents: true },
    }),
    prisma.customerMembership.count({ where: { organizationId, status: "trialing" } }),
    prisma.customerMembership.count({
      where: { organizationId, status: "cancelled", cancelledAt: { gte: monthStart } },
    }),
    prisma.customerMembership.groupBy({
      by: ["planId"],
      where: { organizationId, status: { in: ["active","trialing"] } },
      _count: true,
    }),
    prisma.customerMembership.count({
      where: { organizationId, startedAt: { gte: monthStart } },
    }),
    prisma.membershipPayment.count({
      where: { organizationId, status: "succeeded", paidAt: { gte: monthStart } },
    }),
  ]);

  // Get plan names for top plan
  let topPlan: { name: string; count: number } | null = null;
  if (allPlanCounts.length > 0) {
    const sorted = [...allPlanCounts].sort((a, b) => b._count - a._count);
    const topPlanRecord = sorted[0];
    const plan = await prisma.membershipPlan.findUnique({
      where: { id: topPlanRecord.planId },
      select: { name: true },
    });
    if (plan) topPlan = { name: plan.name, count: topPlanRecord._count };
  }

  const totalAtStartOfMonth = active._count + cancelledThisMonth;
  const churnRate = totalAtStartOfMonth > 0
    ? Math.round((cancelledThisMonth / totalAtStartOfMonth) * 10000) / 100
    : 0;

  const mrrCents = active._sum.amountCents ?? 0;

  // Avg lifetime: total paid / active members
  const lifetimeAgg = await prisma.customerMembership.aggregate({
    where: { organizationId, status: { in: ["active","cancelled"] } },
    _avg: { totalPaidCents: true },
  });

  return {
    mrrCents,
    arrCents: mrrCents * 12,
    activeMembers: active._count,
    trialMembers: trials,
    cancelledThisMonth,
    churnRate,
    avgLifetimeCents: Math.round(lifetimeAgg._avg.totalPaidCents ?? 0),
    topPlan,
    newThisMonth,
    renewalsThisMonth: renewalPayments,
  };
}

// ─── Promo code validation ────────────────────────────────────────────────────

export async function validatePromoCode(
  code: string,
  organizationId: string,
  planId?: string,
  customerId?: string
): Promise<{ valid: boolean; promo?: any; error?: string }> {
  const promo = await prisma.membershipPromoCode.findUnique({
    where: { organizationId_code: { organizationId, code: code.toUpperCase() } },
  });

  if (!promo || !promo.isActive) return { valid: false, error: "Invalid promo code" };
  if (promo.validUntil && new Date() > promo.validUntil) return { valid: false, error: "Promo code expired" };
  if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) return { valid: false, error: "Promo code has reached its limit" };
  if (promo.applicablePlanIds.length > 0 && planId && !promo.applicablePlanIds.includes(planId)) {
    return { valid: false, error: "Promo code not valid for this plan" };
  }

  if (customerId && promo.maxPerCustomer > 0) {
    // Count redemptions by this customer (check via membership promoCode field)
    const used = await prisma.customerMembership.count({
      where: { customerId, organizationId, promoCode: code.toUpperCase() },
    });
    if (used >= promo.maxPerCustomer) return { valid: false, error: "You've already used this promo code" };
  }

  return { valid: true, promo };
}

// ─── Stripe membership subscription helpers ───────────────────────────────────

export function getMembershipStripeMetadata(params: {
  organizationId: string;
  customerId: string;
  membershipId?: string;
  planId: string;
}) {
  return {
    mechanicflow_type: "customer_membership",
    organizationId:    params.organizationId,
    customerId:        params.customerId,
    membershipId:      params.membershipId ?? "",
    planId:            params.planId,
  };
}
