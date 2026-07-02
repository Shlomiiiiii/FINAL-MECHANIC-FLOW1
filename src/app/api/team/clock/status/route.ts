import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(_req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const openEntry = await prisma.employeeClockEntry.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, status: "open" },
      orderBy: { clockedInAt: "desc" },
    });

    const onBreak = openEntry && Array.isArray(openEntry.breaks)
      ? (openEntry.breaks as any[]).some((b: any) => !b.endedAt)
      : false;

    const minutesSinceClockIn = openEntry
      ? Math.round((Date.now() - new Date(openEntry.clockedInAt).getTime()) / 60000)
      : 0;

    return successResponse({
      isClockedIn:  !!openEntry,
      onBreak,
      entry: openEntry,
      minutesSinceClockIn,
    });
  } catch (err) {
    console.error("GET clock status:", err);
    return ApiErrors.internal();
  }
}
