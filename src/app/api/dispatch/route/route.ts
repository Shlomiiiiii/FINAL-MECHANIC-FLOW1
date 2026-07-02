/**
 * POST /api/dispatch/route
 * Compute a route between two points (or tech → job location).
 */
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { computeRoute, isGoogleMapsEnabled } from "@/lib/dispatch";

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body = await request.json();
    const { fromLat, fromLng, toLat, toLng } = body as {
      fromLat: number; fromLng: number; toLat: number; toLng: number;
    };

    if (!fromLat || !fromLng || !toLat || !toLng) {
      return ApiErrors.validation({ coordinates: ["fromLat, fromLng, toLat, toLng are required"] });
    }

    const result = await computeRoute(
      { lat: fromLat, lng: fromLng },
      { lat: toLat,   lng: toLng }
    );

    return successResponse({
      route: result,
      mapsEnabled: isGoogleMapsEnabled(),
    });
  } catch (err) {
    console.error("POST /api/dispatch/route:", err);
    return ApiErrors.internal();
  }
}
