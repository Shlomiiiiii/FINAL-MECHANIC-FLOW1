import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    where: {
      customerId:     session.customerId,
      organizationId: session.organizationId,
      status:         { notIn: ["DRAFT","ARCHIVED"] },
    },
    include: {
      vehicle: { select: { year: true, make: true, model: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  await logPortalAction({ ...session, action: "view_invoices" });
  return NextResponse.json({ invoices });
}
