/**
 * POST /api/dispatch/location
 * Receives GPS pings from technician mobile devices.
 * Updates User.currentLat/Lng and writes to TechnicianLocationPing history.
 * Called every 30-60 seconds by the mobile app while on duty.
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const locationSchema = z.object({
  lat:       z.number().min(-90).max(90),
  lng:       z.number().min(-180).max(180),
  accuracy:  z.number().optional(),
  heading:   z.number().min(0).max(360).optional(),
  speed:     z.number().min(0).optional(),
  altitude:  z.number().optional(),
  jobId:     z.string().optional(),
  source:    z.enum(["mobile","web","manual"]).optional().default("mobile"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body   = await request.json();
    const parsed = locationSchema.safeParse(body);
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
    const now  = new Date();

    // Update user's live position
    await prisma.user.update({
      where: { id: user.id },
      data: {
        currentLat:        data.lat,
        currentLng:        data.lng,
        locationUpdatedAt: now,
      },
    });

    // Write to location history (kept 7 days)
    await prisma.technicianLocationPing.create({
      data: {
        organizationId: user.organizationId,
        userId:         user.id,
        lat:            data.lat,
        lng:            data.lng,
        accuracy:       data.accuracy,
        heading:        data.heading,
        speed:          data.speed,
        altitude:       data.altitude,
        jobId:          data.jobId,
        source:         data.source,
        recordedAt:     now,
      },
    });

    return successResponse({ recorded: true, at: now });
  } catch (err) {
    console.error("POST /api/dispatch/location:", err);
    return ApiErrors.internal();
  }
}
