import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { redeemBenefit } from "@/lib/memberships";
import { z } from "zod";

const redeemSchema = z.object({
  benefitId:   z.string().min(1),
  benefitName: z.string().min(1),
  quantity:    z.number().min(0.01).optional(),
  valueCents:  z.number().int().min(0).optional(),
  jobId:       z.string().optional(),
  invoiceId:   z.string().optional(),
  notes:       z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const membership = await prisma.customerMembership.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, gracePeriodEndsAt: true },
    });
    if (!membership) return ApiErrors.notFound("Membership");

    // Validate membership is active
    if (!["active","trialing"].includes(membership.status)) {
      if (membership.status === "past_due" && membership.gracePeriodEndsAt && new Date() <= membership.gracePeriodEndsAt) {
        // still in grace — allow
      } else {
        return ApiErrors.businessLogic("Membership is not active. Cannot redeem benefits.");
      }
    }

    const body   = await request.json();
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    await redeemBenefit({
      membershipId:   id,
      organizationId: user.organizationId,
      benefitId:      parsed.data.benefitId,
      benefitName:    parsed.data.benefitName,
      quantity:       parsed.data.quantity,
      valueCents:     parsed.data.valueCents,
      jobId:          parsed.data.jobId,
      invoiceId:      parsed.data.invoiceId,
      appliedById:    user.id,
      notes:          parsed.data.notes,
    });

    return successResponse({ redeemed: true });
  } catch (err) {
    console.error("POST /benefits:", err);
    return ApiErrors.internal();
  }
}
