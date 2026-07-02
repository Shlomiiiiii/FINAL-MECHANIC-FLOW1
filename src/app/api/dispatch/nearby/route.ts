/**
 * GET /api/dispatch/nearby?jobId=xxx
 * Returns technicians nearest to a job's service location, sorted by ETA.
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { findNearbyTechnicians } from "@/lib/dispatch";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const { searchParams } = new URL(request.url);
    const jobId        = searchParams.get("jobId");
    const latStr       = searchParams.get("lat");
    const lngStr       = searchParams.get("lng");
    const maxMiles     = parseInt(searchParams.get("maxMiles") ?? "50");
    const includeAll   = searchParams.get("includeAll") === "true";

    let jobLocation: { lat: number; lng: number } | null = null;

    if (jobId) {
      const job = await prisma.job.findFirst({
        where: { id: jobId, organizationId: user.organizationId },
        select: { serviceLat: true, serviceLng: true },
      });
      if (job?.serviceLat && job?.serviceLng) {
        jobLocation = { lat: Number(job.serviceLat), lng: Number(job.serviceLng) };
      }
    } else if (latStr && lngStr) {
      jobLocation = { lat: parseFloat(latStr), lng: parseFloat(lngStr) };
    }

    if (!jobLocation) {
      return ApiErrors.validation({ jobId: ["Job has no service location. Add an address first."] });
    }

    const statuses = includeAll
      ? ["available","on_break","dispatched","traveling","on_site","busy"]
      : ["available","on_break"];

    const nearby = await findNearbyTechnicians(jobLocation, user.organizationId, {
      maxDistanceMiles: maxMiles,
      requiredStatus:   statuses,
      limit:            15,
    });

    return successResponse({
      nearby,
      jobLocation,
      mapsEnabled: !!(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    });
  } catch (err) {
    console.error("GET /api/dispatch/nearby:", err);
    return ApiErrors.internal();
  }
}
