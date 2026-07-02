import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vehicles = await prisma.vehicle.findMany({
    where: { customerId: session.customerId, organizationId: session.organizationId },
    include: {
      maintenanceReminders: {
        where: { isActive: true },
        orderBy: { dueDate: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  await logPortalAction({ ...session, action: "view_vehicles" });
  return NextResponse.json({ vehicles });
}
