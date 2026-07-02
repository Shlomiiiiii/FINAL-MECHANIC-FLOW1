import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";
import { eventsOverlap } from "@/lib/calendar-utils";

const createSchema = z.object({
  customerId:     z.string().min(1, "Customer is required"),
  vehicleId:      z.string().optional(),
  jobId:          z.string().optional(),
  technicianId:   z.string().optional(),
  title:          z.string().min(1, "Title is required").max(200),
  description:    z.string().max(2000).optional(),
  appointmentType: z.enum(["service","estimate","pickup","delivery","inspection","emergency","follow_up"]).default("service"),
  priority:       z.enum(["low","normal","high","emergency"]).default("normal"),
  startsAt:       z.string(),
  endsAt:         z.string(),
  allDay:         z.boolean().optional().default(false),
  locationType:   z.enum(["shop","mobile","pickup","dropoff"]).default("shop"),
  locationAddress: z.string().optional(),
  estimatedDurationMins: z.number().int().min(15).max(480).optional().default(60),
  travelTimeMins:  z.number().int().min(0).optional().default(0),
  bufferAfterMins: z.number().int().min(0).optional().default(0),
  isWaitlisted:   z.boolean().optional().default(false),
  notes:          z.string().max(2000).optional(),
  internalNotes:  z.string().max(2000).optional(),
  // Recurring
  isRecurring:    z.boolean().optional().default(false),
  recurringRule:  z.string().optional(), // RRULE string
  recurringEnd:   z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const from         = searchParams.get("from");
    const to           = searchParams.get("to");
    const technicianId = searchParams.get("technicianId");
    const customerId   = searchParams.get("customerId");
    const status       = searchParams.get("status");
    const view         = searchParams.get("view") ?? "week";

    if (!from || !to) return ApiErrors.validation({ from: ["Date range required"], to: ["Date range required"] });

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      startsAt: { gte: new Date(from) },
      endsAt:   { lte: new Date(to) },
    };

    if (technicianId) where.technicianId = technicianId;
    if (customerId)   where.customerId   = customerId;
    if (status)       where.status       = status;

    // Technicians see only their own appointments
    if (user.role === "TECHNICIAN") {
      where.technicianId = user.id;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phonePrimary: true, email: true, addressLine1: true, city: true, state: true } },
        vehicle:  { select: { id: true, year: true, make: true, model: true } },
        technician: { select: { id: true, fullName: true, color: true, avatarUrl: true } },
        job:        { select: { id: true, jobNumber: true, status: true } },
        createdBy:  { select: { id: true, fullName: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    // Also fetch technicians + time off for the range
    const [technicians, timeOff] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true, fullName: true, color: true, avatarUrl: true, role: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.technicianTimeOff.findMany({
        where: {
          organizationId: user.organizationId,
          startsAt: { lte: new Date(to) },
          endsAt:   { gte: new Date(from) },
        },
        include: { user: { select: { id: true, fullName: true } } },
      }),
    ]);

    return successResponse({ appointments, technicians, timeOff });
  } catch (err) {
    console.error("GET /api/appointments:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body   = await request.json();
    const parsed = createSchema.safeParse(body);

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
    const startsAt = new Date(data.startsAt);
    const endsAt   = new Date(data.endsAt);

    if (endsAt <= startsAt) {
      return ApiErrors.validation({ endsAt: ["End time must be after start time"] });
    }

    // Conflict detection for assigned technician
    if (data.technicianId) {
      const conflicts = await prisma.appointment.findMany({
        where: {
          organizationId: user.organizationId,
          technicianId:   data.technicianId,
          status:         { notIn: ["CANCELLED","NO_SHOW"] },
          startsAt:       { lt: endsAt },
          endsAt:         { gt: startsAt },
        },
        select: { id: true, title: true, startsAt: true, endsAt: true },
      });

      if (conflicts.length > 0 && !data.isWaitlisted) {
        return ApiErrors.conflict(
          `Scheduling conflict: technician is already booked for "${conflicts[0].title}" at that time.`
        );
      }
    }

    // Check technician time off
    if (data.technicianId) {
      const timeOff = await prisma.technicianTimeOff.findFirst({
        where: {
          userId:   data.technicianId,
          startsAt: { lt: endsAt },
          endsAt:   { gt: startsAt },
        },
      });
      if (timeOff) {
        return ApiErrors.conflict(`Technician has time off during this period: "${timeOff.title}"`);
      }
    }

    const appointment = await prisma.appointment.create({
      data: {
        organizationId:        user.organizationId,
        customerId:            data.customerId,
        vehicleId:             data.vehicleId || undefined,
        jobId:                 data.jobId     || undefined,
        technicianId:          data.technicianId || undefined,
        title:                 data.title,
        description:           data.description,
        appointmentType:       data.appointmentType,
        priority:              data.priority,
        startsAt,
        endsAt,
        allDay:                data.allDay ?? false,
        locationType:          data.locationType,
        locationAddress:       data.locationAddress,
        estimatedDurationMins: data.estimatedDurationMins ?? 60,
        travelTimeMins:        data.travelTimeMins ?? 0,
        bufferAfterMins:       data.bufferAfterMins ?? 0,
        isWaitlisted:          data.isWaitlisted ?? false,
        isRecurring:           data.isRecurring ?? false,
        recurringRule:         data.recurringRule,
        recurringEnd:          data.recurringEnd ? new Date(data.recurringEnd) : undefined,
        notes:                 data.notes,
        internalNotes:         data.internalNotes,
        createdById:           user.id,
      },
      include: {
        customer:  { select: { id: true, firstName: true, lastName: true, phonePrimary: true } },
        vehicle:   { select: { year: true, make: true, model: true } },
        technician: { select: { id: true, fullName: true, color: true } },
        job:        { select: { id: true, jobNumber: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId:         user.id,
        action:         "CREATED",
        resourceType:   "appointment",
        resourceId:     appointment.id,
      },
    });

    return successResponse({ appointment }, 201);
  } catch (err) {
    console.error("POST /api/appointments:", err);
    return ApiErrors.internal();
  }
}
