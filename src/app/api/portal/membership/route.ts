import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { getMembershipBenefitStatus } from "@/lib/memberships";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.customerMembership.findFirst({
    where: {
      customerId:     session.customerId,
      organizationId: session.organizationId,
      status:         { in: ["active","trialing","past_due","paused"] },
    },
    include: { plan: true },
  });

  if (!membership) return NextResponse.json({ membership: null });

  const benefitStatus = await getMembershipBenefitStatus(membership, membership.plan);
  const payments = await prisma.membershipPayment.findMany({
    where: { membershipId: membership.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  await logPortalAction({ ...session, action: "view_membership", resourceId: membership.id });
  return NextResponse.json({ membership: { ...membership, benefitStatus }, payments });
}
