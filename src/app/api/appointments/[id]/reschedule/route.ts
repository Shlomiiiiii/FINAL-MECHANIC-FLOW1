import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const body = await request.json();
    const { startsAt, endsAt, technicianId } = body as { startsAt: string; endsAt: string; technicianId?: string };

    if (!startsAt || !endsAt) return ApiErrors.validation({ startsAt: ["Required"], endsAt: ["Required"] });

    const existing = await prisma.appointment.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, technicianId: true, title: true },
    });
    if (!existing) return ApiErrors.notFound("Appointment");

    const newStart = new Date(startsAt);
    const newEnd   = new Date(endsAt);
    const techId   = technicianId ?? existing.technicianId;

    // Conflict check
    if (techId) {
      const conflicts = await prisma.appointment.findMany({
        where: {
          organizationId: user.organizationId,
          technicianId:   techId,
          status:         { notIn: ["CANCELLED","NO_SHOW"] },
          startsAt:       { lt: newEnd },
          endsAt:         { gt: newStart },
          NOT:            { id },
        },
        select: { title: true, startsAt: true },
      });

      if (conflicts.length > 0) {
        return ApiErrors.conflict(`Conflict with "${conflicts[0].title}" at that time.`);
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        startsAt:    newStart,
        endsAt:      newEnd,
        technicianId: techId,
        status:       "RESCHEDULED",
      },
      include: {
        customer:   { select: { firstName: true, lastName: true } },
        technician: { select: { fullName: true } },
      },
    });

    return successResponse({ appointment: updated });
  } catch (err) {
    console.error("POST /reschedule:", err);
    return ApiErrors.internal();
  }
}
