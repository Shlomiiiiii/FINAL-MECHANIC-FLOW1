import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reminders = await prisma.maintenanceReminder.findMany({
    where: {
      organizationId: session.organizationId,
      vehicle: { customerId: session.customerId },
      isActive: true,
    },
    include: { vehicle: { select: { year: true, make: true, model: true } } },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({ reminders });
}
