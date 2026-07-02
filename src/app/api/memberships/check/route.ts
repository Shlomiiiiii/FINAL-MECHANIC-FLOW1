import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { checkCustomerMembership } from "@/lib/memberships";

/**
 * Called from the job creation flow to check if a customer has an active membership.
 * Returns all available benefits and discounts that should be applied.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) return ApiErrors.validation({ customerId: ["Required"] });

    const result = await checkCustomerMembership(customerId, user.organizationId);
    return successResponse({ result });
  } catch (err) {
    console.error("GET /memberships/check:", err);
    return ApiErrors.internal();
  }
}
