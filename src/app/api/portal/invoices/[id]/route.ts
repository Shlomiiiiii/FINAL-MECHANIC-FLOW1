import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, customerId: session.customerId, organizationId: session.organizationId },
    include: {
      vehicle:   { select: { year: true, make: true, model: true, vin: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments:  { where: { status: "SUCCEEDED" }, orderBy: { processedAt: "desc" } },
      organization: { select: { name: true, phone: true, email: true, taxLabel: true } },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logPortalAction({ ...session, action: "view_invoice", resourceType: "invoice", resourceId: id });
  return NextResponse.json({ invoice });
}
