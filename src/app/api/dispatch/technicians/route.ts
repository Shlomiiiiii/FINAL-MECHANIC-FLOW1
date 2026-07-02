/**
 * GET /api/dispatch/technicians
 * Returns all active technicians with their current dispatch status and location.
 * Called every 30 seconds by the dispatch board for live updates.
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const includeOffline = searchParams.get("includeOffline") === "true";

    const where: Record<string, unknown> = {
      organizationId:   user.organizationId,
      isActive:         true,
      employmentStatus: { not: "terminated" },
    };
    if (!includeOffline) {
      where.dispatchStatus = { not: "offline" };
    }

    const techs = await prisma.user.findMany({
      where,
      select: {
        id:               true,
        fullName:         true,
        color:            true,
        avatarUrl:        true,
        role:             true,
        position:         true,
        skillLevel:       true,
        specialties:      true,
        dispatchStatus:   true,
        currentLat:       true,
        currentLng:       true,
        locationUpdatedAt: true,
        activeJobId:      true,
        lastDispatchedAt: true,
        // Active job info
        jobAssignments: {
          where: {
            job: {
              status: {
                in: ["TECH_ASSIGNED","TRAVELING","ON_SITE","IN_PROGRESS","SCHEDULED"],
              },
              deletedAt: null,
            },
          },
          include: {
            job: {
              select: {
                id: true, jobNumber: true, title: true, status: true,
                priority: true, isEmergency: true,
                serviceAddressLine1: true, serviceCity: true,
                serviceLat: true, serviceLng: true,
                scheduledAt: true, etaMinutes: true,
                customer: { select: { firstName: true, lastName: true } },
              },
            },
          },
          take: 3,
        },
      },
      orderBy: [{ dispatchStatus: "asc" }, { fullName: "asc" }],
    });

    // Compute location age
    const now = Date.now();
    const enriched = techs.map(t => ({
      ...t,
      locationAgeMins: t.locationUpdatedAt
        ? Math.round((now - t.locationUpdatedAt.getTime()) / 60000)
        : null,
      hasRecentLocation: t.locationUpdatedAt
        ? (now - t.locationUpdatedAt.getTime()) < 30 * 60 * 1000
        : false,
    }));

    return successResponse({ technicians: enriched, updatedAt: new Date() });
  } catch (err) {
    console.error("GET /api/dispatch/technicians:", err);
    return ApiErrors.internal();
  }
}

// PATCH /api/dispatch/technicians — update own dispatch status
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body = await request.json();
    const { dispatchStatus } = body as { dispatchStatus: string };

    const VALID_STATUSES = ["offline","available","dispatched","traveling","on_site","on_break","busy"];
    if (!VALID_STATUSES.includes(dispatchStatus)) {
      return ApiErrors.validation({ dispatchStatus: ["Invalid status"] });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { dispatchStatus },
      select: { id: true, dispatchStatus: true },
    });

    return successResponse({ user: updated });
  } catch (err) {
    console.error("PATCH /api/dispatch/technicians:", err);
    return ApiErrors.internal();
  }
}
