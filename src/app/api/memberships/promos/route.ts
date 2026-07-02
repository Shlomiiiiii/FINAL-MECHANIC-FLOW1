import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const promoSchema = z.object({
  code:              z.string().min(3).max(30).transform(v => v.toUpperCase().replace(/\s/g,"")),
  description:       z.string().max(200).optional(),
  discountType:      z.enum(["pct","flat","trial_days","first_month_free"]),
  discountPct:       z.number().int().min(0).max(100).optional().default(0),
  discountCents:     z.number().int().min(0).optional().default(0),
  trialDaysBonus:    z.number().int().min(0).optional().default(0),
  applicablePlanIds: z.array(z.string()).optional().default([]),
  maxRedemptions:    z.number().int().min(1).optional(),
  maxPerCustomer:    z.number().int().min(1).optional().default(1),
  validFrom:         z.string(),
  validUntil:        z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const promos = await prisma.membershipPromoCode.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return successResponse({ promos });
  } catch (err) {
    console.error("GET /promos:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = promoSchema.safeParse(body);

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
    const conflict = await prisma.membershipPromoCode.findUnique({
      where: { organizationId_code: { organizationId: user.organizationId, code: data.code } },
    });
    if (conflict) return ApiErrors.conflict(`Promo code "${data.code}" already exists.`);

    const promo = await prisma.membershipPromoCode.create({
      data: {
        organizationId:    user.organizationId,
        code:              data.code,
        description:       data.description,
        discountType:      data.discountType,
        discountPct:       data.discountPct ?? 0,
        discountCents:     data.discountCents ?? 0,
        trialDaysBonus:    data.trialDaysBonus ?? 0,
        applicablePlanIds: data.applicablePlanIds,
        maxRedemptions:    data.maxRedemptions,
        maxPerCustomer:    data.maxPerCustomer ?? 1,
        validFrom:         new Date(data.validFrom),
        validUntil:        data.validUntil ? new Date(data.validUntil) : undefined,
      },
    });

    return successResponse({ promo }, 201);
  } catch (err) {
    console.error("POST /promos:", err);
    return ApiErrors.internal();
  }
}
