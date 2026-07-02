import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;
    if (user.role === "TECHNICIAN" && id !== user.id) return ApiErrors.forbidden();

    const { searchParams } = new URL(_req.url);
    const from  = searchParams.get("from");
    const to    = searchParams.get("to");

    const entries = await prisma.employeeClockEntry.findMany({
      where: {
        userId:         id,
        organizationId: user.organizationId,
        ...(from ? { clockedInAt: { gte: new Date(from) } } : {}),
        ...(to   ? { clockedInAt: { lte: new Date(to)   } } : {}),
      },
      orderBy: { clockedInAt: "desc" },
      take: 50,
    });

    const openEntry = entries.find(e => e.status === "open");

    return successResponse({ entries, openEntry: openEntry ?? null });
  } catch (err) {
    console.error("GET clock:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    // Can clock own time; managers can clock for anyone
    if (user.role === "TECHNICIAN" && id !== user.id) return ApiErrors.forbidden();

    const body = await request.json();
    const { action, lat, lng, notes } = body as {
      action: "clock_in" | "clock_out" | "break_start" | "break_end";
      lat?: number; lng?: number; notes?: string;
    };

    const now = new Date();

    if (action === "clock_in") {
      // Check no open entry
      const open = await prisma.employeeClockEntry.findFirst({
        where: { userId: id, organizationId: user.organizationId, status: "open" },
      });
      if (open) return ApiErrors.businessLogic("Already clocked in. Clock out first.");

      // Pay period: Mon-Sun week
      const dayOfWeek = now.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const periodStart = new Date(now); periodStart.setDate(now.getDate() + diffToMon); periodStart.setHours(0,0,0,0);
      const periodEnd   = new Date(periodStart); periodEnd.setDate(periodStart.getDate() + 6); periodEnd.setHours(23,59,59,999);

      const entry = await prisma.employeeClockEntry.create({
        data: {
          organizationId: user.organizationId,
          userId:         id,
          clockedInAt:    now,
          clockInLat:     lat,
          clockInLng:     lng,
          gpsVerified:    !!(lat && lng),
          status:         "open",
          payPeriodStart: periodStart,
          payPeriodEnd:   periodEnd,
          notes,
        },
      });
      return successResponse({ entry, action: "clocked_in" });
    }

    if (action === "clock_out") {
      const open = await prisma.employeeClockEntry.findFirst({
        where: { userId: id, organizationId: user.organizationId, status: "open" },
      });
      if (!open) return ApiErrors.businessLogic("Not clocked in.");

      const totalMinutes = Math.round((now.getTime() - open.clockedInAt.getTime()) / 60000);
      const breakMinutes = Array.isArray(open.breaks)
        ? (open.breaks as any[]).reduce((s, b) => s + (b.durationMinutes ?? 0), 0)
        : 0;
      const workedMinutes    = totalMinutes - breakMinutes;
      const regularMinutes   = Math.min(workedMinutes, 480); // 8h regular
      const overtimeMinutes  = Math.max(0, workedMinutes - 480);

      const entry = await prisma.employeeClockEntry.update({
        where: { id: open.id },
        data: {
          clockedOutAt:   now,
          clockOutLat:    lat,
          clockOutLng:    lng,
          status:         "clocked_out",
          totalMinutes,
          regularMinutes,
          overtimeMinutes,
          breakMinutes,
          notes: notes ?? open.notes,
        },
      });
      return successResponse({ entry, action: "clocked_out", hoursWorked: workedMinutes / 60 });
    }

    if (action === "break_start" || action === "break_end") {
      const open = await prisma.employeeClockEntry.findFirst({
        where: { userId: id, organizationId: user.organizationId, status: "open" },
      });
      if (!open) return ApiErrors.businessLogic("Not clocked in.");

      const breaks = Array.isArray(open.breaks) ? [...(open.breaks as any[])] : [];

      if (action === "break_start") {
        const onBreak = breaks.some(b => !b.endedAt);
        if (onBreak) return ApiErrors.businessLogic("Already on break.");
        breaks.push({ startedAt: now.toISOString(), type: "break" });
      } else {
        const lastBreak = breaks.findLast((b: any) => !b.endedAt);
        if (!lastBreak) return ApiErrors.businessLogic("Not on break.");
        lastBreak.endedAt = now.toISOString();
        lastBreak.durationMinutes = Math.round((now.getTime() - new Date(lastBreak.startedAt).getTime()) / 60000);
      }

      const entry = await prisma.employeeClockEntry.update({
        where: { id: open.id },
        data:  { breaks: breaks as any },
      });
      return successResponse({ entry, action });
    }

    return ApiErrors.validation({ action: ["Invalid action"] });
  } catch (err) {
    console.error("POST clock:", err);
    return ApiErrors.internal();
  }
}
