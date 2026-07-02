/**
 * POST /api/dispatch/assign
 * Assign or reassign a technician to a job.
 * Computes route + ETA, updates job status, sends notification.
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { computeRoute, logDispatchEvent } from "@/lib/dispatch";
import { z } from "zod";

const assignSchema = z.object({
  jobId:        z.string().min(1),
  userId:       z.string().min(1),
  isLead:       z.boolean().optional().default(true),
  dispatchNow:  z.boolean().optional().default(true), // immediately change job status
  note:         z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const { jobId, userId, isLead, dispatchNow, note } = parsed.data;

    const [job, tech] = await Promise.all([
      prisma.job.findFirst({
        where: { id: jobId, organizationId: user.organizationId, deletedAt: null },
        select: { id: true, title: true, status: true, serviceLat: true, serviceLng: true, priority: true, isEmergency: true },
      }),
      prisma.user.findFirst({
        where: { id: userId, organizationId: user.organizationId, isActive: true },
        select: { id: true, fullName: true, currentLat: true, currentLng: true, dispatchStatus: true },
      }),
    ]);

    if (!job)  return ApiErrors.notFound("Job");
    if (!tech) return ApiErrors.notFound("Technician");

    // Compute route if both have coordinates
    let routeResult = null;
    if (tech.currentLat && tech.currentLng && job.serviceLat && job.serviceLng) {
      const from = { lat: Number(tech.currentLat), lng: Number(tech.currentLng) };
      const to   = { lat: Number(job.serviceLat),  lng: Number(job.serviceLng) };
      routeResult = await computeRoute(from, to);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Upsert assignment (handles re-assignment)
      await tx.jobAssignment.upsert({
        where: { jobId_userId: { jobId, userId } },
        create: { organizationId: user.organizationId, jobId, userId, isLead, assignedById: user.id },
        update: { isLead, assignedById: user.id, assignedAt: new Date() },
      });

      // If dispatching now: update job status and technician status
      const updateData: Record<string, unknown> = {};
      if (dispatchNow) {
        if (["APPROVED","SCHEDULED","LEAD"].includes(job.status)) {
          updateData.status       = "TECH_ASSIGNED";
          updateData.dispatchedAt = new Date();
        }
        if (routeResult) {
          updateData.etaMinutes    = routeResult.durationMins;
          updateData.distanceMiles = routeResult.distanceMiles;
        }
      }
      if (Object.keys(updateData).length > 0) {
        await tx.job.update({ where: { id: jobId }, data: updateData });
      }

      // Update technician dispatch status
      if (dispatchNow && tech.dispatchStatus === "available") {
        await tx.user.update({
          where: { id: userId },
          data: {
            dispatchStatus:   "dispatched",
            activeJobId:      jobId,
            lastDispatchedAt: new Date(),
          },
        });
      }

      // Save route plan
      if (routeResult && tech.currentLat && tech.currentLng && job.serviceLat && job.serviceLng) {
        await tx.routePlan.upsert({
          where: { jobId },
          create: {
            organizationId: user.organizationId,
            jobId,
            userId,
            originLat:      Number(tech.currentLat),
            originLng:      Number(tech.currentLng),
            destLat:        Number(job.serviceLat),
            destLng:        Number(job.serviceLng),
            distanceMiles:  routeResult.distanceMiles,
            durationMins:   routeResult.durationMins,
            etaAt:          routeResult.etaAt,
            googlePolyline: routeResult.polyline,
            hasTrafficData: routeResult.hasTrafficData,
          },
          update: {
            userId,
            originLat:      Number(tech.currentLat),
            originLng:      Number(tech.currentLng),
            distanceMiles:  routeResult.distanceMiles,
            durationMins:   routeResult.durationMins,
            etaAt:          routeResult.etaAt,
            googlePolyline: routeResult.polyline,
            hasTrafficData: routeResult.hasTrafficData,
          },
        });
      }

      return { jobId, userId, routeResult };
    });

    await logDispatchEvent({
      organizationId: user.organizationId,
      eventType:      "job_assigned",
      jobId,
      userId,
      actorId:        user.id,
      payload: {
        techName: tech.fullName,
        jobTitle: job.title,
        etaMinutes: routeResult?.durationMins,
        distanceMiles: routeResult?.distanceMiles,
        note,
      },
      priority: job.isEmergency ? "emergency" : job.priority.toLowerCase(),
    });

    return successResponse({ assigned: true, routeResult, jobId, technicianId: userId });
  } catch (err) {
    console.error("POST /api/dispatch/assign:", err);
    return ApiErrors.internal();
  }
}
