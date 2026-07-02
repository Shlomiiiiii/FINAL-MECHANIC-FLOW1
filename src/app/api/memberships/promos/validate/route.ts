import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { validatePromoCode } from "@/lib/memberships";

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { code, planId, customerId } = await request.json();
    if (!code) return ApiErrors.validation({ code: ["Required"] });

    const result = await validatePromoCode(code, user.organizationId, planId, customerId);
    return successResponse({ result });
  } catch (err) {
    console.error("POST /promos/validate:", err);
    return ApiErrors.internal();
  }
}
