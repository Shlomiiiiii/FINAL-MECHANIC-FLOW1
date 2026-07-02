import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const timeOffSchema = z.object({
  userId:  z.string(),
  title:   z.string().min(1).max(200),
  reason:  z.enum(["vacation","sick","training","personal"]).optional(),
  startsAt: z.string(),
  endsAt:   z.string(),
  allDay:   z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const from   = searchParams.get("from");
    const to     = searchParams.get("to");
    const userId = searchParams.get("userId");

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (userId) where.userId = userId;
    if (from && to) {
      where.startsAt = { lte: new Date(to) };
      where.endsAt   = { gte: new Date(from) };
    }

    const timeOff = await prisma.technicianTimeOff.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, color: true } } },
      orderBy: { startsAt: "asc" },
    });

    return successResponse({ timeOff });
  } catch (err) {
    console.error("GET /technicians/time-off:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    // Technicians can request their own, managers can approve/create for anyone
    const body   = await request.json();
    const parsed = timeOffSchema.safeParse(body);
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

    // Technicians can only create for themselves
    if (user.role === "TECHNICIAN" && data.userId !== user.id) {
      return ApiErrors.forbidden();
    }

    const record = await prisma.technicianTimeOff.create({
      data: {
        organizationId: user.organizationId,
        userId:   data.userId,
        title:    data.title,
        reason:   data.reason,
        startsAt: new Date(data.startsAt),
        endsAt:   new Date(data.endsAt),
        allDay:   data.allDay ?? true,
        approved: ["OWNER","MANAGER"].includes(user.role),
        approvedById: ["OWNER","MANAGER"].includes(user.role) ? user.id : undefined,
      },
      include: { user: { select: { fullName: true } } },
    });

    return successResponse({ timeOff: record }, 201);
  } catch (err) {
    console.error("POST /technicians/time-off:", err);
    return ApiErrors.internal();
  }
}
