import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const availabilitySchema = z.object({
  userId:     z.string(),
  dayOfWeek:  z.number().int().min(-1).max(6),
  date:       z.string().optional(),
  isAvailable: z.boolean(),
  startTime:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime:    z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakEnd:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  maxJobs:    z.number().int().optional(),
  notes:      z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (userId) where.userId = userId;

    const availability = await prisma.technicianAvailability.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, color: true } } },
      orderBy: [{ userId: "asc" }, { dayOfWeek: "asc" }],
    });

    return successResponse({ availability });
  } catch (err) {
    console.error("GET /technicians/availability:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;

    const record = await prisma.technicianAvailability.upsert({
      where: {
        userId_dayOfWeek_date: {
          userId:    data.userId,
          dayOfWeek: data.dayOfWeek,
          date:      data.date ? new Date(data.date) : null as any,
        },
      },
      create: {
        organizationId: user.organizationId,
        userId:     data.userId,
        dayOfWeek:  data.dayOfWeek,
        date:       data.date ? new Date(data.date) : undefined,
        isAvailable: data.isAvailable,
        startTime:  data.startTime,
        endTime:    data.endTime,
        breakStart: data.breakStart,
        breakEnd:   data.breakEnd,
        maxJobs:    data.maxJobs,
        notes:      data.notes,
      },
      update: {
        isAvailable: data.isAvailable,
        startTime:   data.startTime,
        endTime:     data.endTime,
        breakStart:  data.breakStart,
        breakEnd:    data.breakEnd,
        maxJobs:     data.maxJobs,
        notes:       data.notes,
      },
    });

    return successResponse({ availability: record }, 201);
  } catch (err) {
    console.error("POST /technicians/availability:", err);
    return ApiErrors.internal();
  }
}
