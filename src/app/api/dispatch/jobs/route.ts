/**
 * GET /api/dispatch/jobs
 * Returns the dispatch queue — unassigned + active jobs sorted by priority.
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { getDispatchScore } from "@/lib/dispatch";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const { searchParams } = new URL(request.url);
    const queue   = searchParams.get("queue");    // unassigned | active | emergency
    const dateStr = searchParams.get("date");     // YYYY-MM-DD — filter by scheduled date

    const ACTIVE_STATUSES = [
      "LEAD","APPROVED","SCHEDULED","TECH_ASSIGNED",
      "TRAVELING","ON_SITE","IN_PROGRESS","WAITING_PARTS","PAUSED","PENDING_REVIEW",
    ];

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      deletedAt:      null,
      status:         { in: ACTIVE_STATUSES },
    };

    if (queue === "emergency") where.isEmergency = true;
    if (queue === "unassigned") {
      where.assignments = { none: {} };
    }

    if (dateStr) {
      const day = new Date(dateStr);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      where.scheduledAt = { gte: day, lt: next };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phonePrimary: true, addressLine1: true, city: true, state: true } },
        vehicle:  { select: { year: true, make: true, model: true } },
        assignments: {
          include: { user: { select: { id: true, fullName: true, color: true, dispatchStatus: true, currentLat: true, currentLng: true } } },
        },
      },
      orderBy: [{ isEmergency: "desc" }, { scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 100,
    });

    // Sort by dispatch score
    const scored = jobs.map(j => ({
      ...j,
      dispatchScore: getDispatchScore({
        priority:    j.priority,
        isEmergency: j.isEmergency,
        scheduledAt: j.scheduledAt,
        createdAt:   j.createdAt,
      }),
    })).sort((a, b) => b.dispatchScore - a.dispatchScore);

    return successResponse({ jobs: scored, total: scored.length, updatedAt: new Date() });
  } catch (err) {
    console.error("GET /api/dispatch/jobs:", err);
    return ApiErrors.internal();
  }
}
