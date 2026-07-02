import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { getMembershipBenefitStatus, parsePlanBenefits } from "@/lib/memberships";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const membership = await prisma.customerMembership.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true } },
        plan:     true,
        benefitUsage: { orderBy: { usedAt: "desc" }, take: 20 },
        payments:     { orderBy: { createdAt: "desc" }, take: 12 },
        events:       { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!membership) return ApiErrors.notFound("Membership");

    // Compute live benefit status
    const benefitStatus = await getMembershipBenefitStatus(membership, membership.plan);

    return successResponse({ membership: { ...membership, benefitStatus } });
  } catch (err) {
    console.error("GET membership:", err);
    return ApiErrors.internal();
  }
}
