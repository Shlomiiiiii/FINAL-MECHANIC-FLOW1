import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { getMembershipAnalytics } from "@/lib/memberships";

export async function GET(_req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const analytics = await getMembershipAnalytics(user.organizationId);
    return successResponse({ analytics });
  } catch (err) {
    console.error("GET /memberships/analytics:", err);
    return ApiErrors.internal();
  }
}
