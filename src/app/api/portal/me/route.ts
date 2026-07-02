import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      phonePrimary: true, addressLine1: true, city: true, state: true, zip: true,
      totalJobCount: true, lastServiceAt: true, lifetimeRevenueCents: true,
    },
  });

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: {
      name: true, slug: true, phone: true, email: true, logoUrl: true,
      portalWelcomeMessage: true, portalAllowBooking: true,
      portalAllowChat: true, portalAllowPhotoUpload: true,
    },
  });

  return NextResponse.json({ customer, organization: org });
}
