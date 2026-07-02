import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const updateSchema = z.object({
  technicianId:    z.string().nullable().optional(),
  title:           z.string().min(1).max(200).optional(),
  description:     z.string().max(2000).optional(),
  appointmentType: z.enum(["service","estimate","pickup","delivery","inspection","emergency","follow_up"]).optional(),
  priority:        z.enum(["low","normal","high","emergency"]).optional(),
  startsAt:        z.string().optional(),
  endsAt:          z.string().optional(),
  locationType:    z.enum(["shop","mobile","pickup","dropoff"]).optional(),
  locationAddress: z.string().optional(),
  estimatedDurationMins: z.number().int().optional(),
  travelTimeMins:  z.number().int().optional(),
  notes:           z.string().max(2000).optional(),
  internalNotes:   z.string().max(2000).optional(),
  status:          z.enum(["SCHEDULED","CONFIRMED","IN_PROGRESS","COMPLETED","CANCELLED","NO_SHOW","WAITLISTED","RESCHEDULED"]).optional(),
  cancelReason:    z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        customer:  { select: { id: true, firstName: true, lastName: true, phonePrimary: true, email: true, addressLine1: true, city: true, state: true } },
        vehicle:   { select: { id: true, year: true, make: true, model: true, trim: true } },
        technician: { select: { id: true, fullName: true, color: true, phone: true } },
        job:        { select: { id: true, jobNumber: true, status: true, title: true } },
        createdBy:  { select: { id: true, fullName: true } },
      },
    });

    if (!appointment) return ApiErrors.notFound("Appointment");
    return successResponse({ appointment });
  } catch (err) {
    console.error("GET /api/appointments/[id]:", err);
    return ApiErrors.internal();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const existing = await prisma.appointment.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, technicianId: true, startsAt: true, endsAt: true },
    });
    if (!existing) return ApiErrors.notFound("Appointment");

    if (["CANCELLED","COMPLETED"].includes(existing.status)) {
      return ApiErrors.businessLogic("Cannot edit a completed or cancelled appointment.");
    }

    const body   = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data     = parsed.data;
    const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
    const endsAt   = data.endsAt   ? new Date(data.endsAt)   : existing.endsAt;
    const techId   = data.technicianId !== undefined ? data.technicianId : existing.technicianId;

    // Conflict check on reschedule
    if ((data.startsAt || data.technicianId !== undefined) && techId) {
      const conflicts = await prisma.appointment.findMany({
        where: {
          organizationId: user.organizationId,
          technicianId:   techId,
          status:         { notIn: ["CANCELLED","NO_SHOW"] },
          startsAt:       { lt: endsAt },
          endsAt:         { gt: startsAt },
          NOT:            { id },
        },
        select: { id: true, title: true, startsAt: true, endsAt: true },
      });

      if (conflicts.length > 0 && data.status !== "WAITLISTED") {
        return ApiErrors.conflict(`Conflict with "${conflicts[0].title}". Use waitlist or choose another time.`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.technicianId !== undefined) updateData.technicianId = data.technicianId;
    if (data.title)                      updateData.title        = data.title;
    if (data.description !== undefined)  updateData.description  = data.description;
    if (data.appointmentType)            updateData.appointmentType = data.appointmentType;
    if (data.priority)                   updateData.priority     = data.priority;
    if (data.startsAt)                   updateData.startsAt     = startsAt;
    if (data.endsAt)                     updateData.endsAt       = endsAt;
    if (data.locationType)               updateData.locationType = data.locationType;
    if (data.locationAddress !== undefined) updateData.locationAddress = data.locationAddress;
    if (data.estimatedDurationMins)      updateData.estimatedDurationMins = data.estimatedDurationMins;
    if (data.travelTimeMins !== undefined)   updateData.travelTimeMins = data.travelTimeMins;
    if (data.notes !== undefined)        updateData.notes        = data.notes;
    if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes;
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "CANCELLED") {
        updateData.cancelledAt  = new Date();
        updateData.cancelReason = data.cancelReason;
      }
      if (data.status === "RESCHEDULED" && data.startsAt) {
        updateData.status = "RESCHEDULED";
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        customer:  { select: { id: true, firstName: true, lastName: true } },
        vehicle:   { select: { year: true, make: true, model: true } },
        technician: { select: { id: true, fullName: true, color: true } },
      },
    });

    return successResponse({ appointment: updated });
  } catch (err) {
    console.error("PATCH /api/appointments/[id]:", err);
    return ApiErrors.internal();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await prisma.appointment.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) return ApiErrors.notFound("Appointment");

    await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Deleted by staff" },
    });

    return successResponse({ success: true });
  } catch (err) {
    console.error("DELETE /api/appointments/[id]:", err);
    return ApiErrors.internal();
  }
}
