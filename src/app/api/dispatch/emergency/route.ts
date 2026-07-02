/**
 * POST /api/dispatch/emergency
 * Declare a job as emergency. Finds nearest available tech, auto-assigns.
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { findNearbyTechnicians, logDispatchEvent, computeRoute } from "@/lib/dispatch";

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const { jobId, autoAssign = false, note } = body as { jobId: string; autoAssign?: boolean; note?: string };

    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true, title: true, jobNumber: true, status: true,
        serviceLat: true, serviceLng: true,
      },
    });
    if (!job) return ApiErrors.notFound("Job");

    // Mark as emergency + bump priority to URGENT
    await prisma.job.update({
      where: { id: jobId },
      data:  { isEmergency: true, priority: "URGENT" },
    });

    await logDispatchEvent({
      organizationId: user.organizationId,
      eventType:      "emergency_declared",
      jobId,
      actorId:        user.id,
      payload:        { jobTitle: job.title, note },
      priority:       "emergency",
    });

    let autoAssigned = null;
    if (autoAssign && job.serviceLat && job.serviceLng) {
      const location = { lat: Number(job.serviceLat), lng: Number(job.serviceLng) };
      const nearby   = await findNearbyTechnicians(location, user.organizationId, {
        maxDistanceMiles: 30,
        requiredStatus:   ["available"],
        limit:            1,
      });

      if (nearby.length > 0) {
        const closest = nearby[0];
        let routeResult = null;

        if (closest.position) {
          routeResult = await computeRoute(closest.position, location);
        }

        await prisma.$transaction(async (tx) => {
          await tx.jobAssignment.upsert({
            where: { jobId_userId: { jobId, userId: closest.userId } },
            create: { organizationId: user.organizationId, jobId, userId: closest.userId, isLead: true, assignedById: user.id },
            update: { isLead: true, assignedById: user.id, assignedAt: new Date() },
          });
          await tx.job.update({
            where: { id: jobId },
            data: {
              status:      "TECH_ASSIGNED",
              dispatchedAt: new Date(),
              etaMinutes:  routeResult?.durationMins,
              distanceMiles: routeResult?.distanceMiles,
            },
          });
          await tx.user.update({
            where: { id: closest.userId },
            data: { dispatchStatus: "dispatched", activeJobId: jobId, lastDispatchedAt: new Date() },
          });
        });

        autoAssigned = { technician: closest, routeResult };

        await logDispatchEvent({
          organizationId: user.organizationId,
          eventType:      "job_assigned",
          jobId,
          userId:         closest.userId,
          actorId:        user.id,
          payload:        { autoAssigned: true, etaMinutes: routeResult?.durationMins },
          priority:       "emergency",
        });
      }
    }

    return successResponse({ emergency: true, jobId, autoAssigned });
  } catch (err) {
    console.error("POST /api/dispatch/emergency:", err);
    return ApiErrors.internal();
  }
}
