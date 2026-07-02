import { getSession } from "@/lib/auth/session";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    return successResponse({ user });
  } catch {
    return ApiErrors.internal();
  }
}
