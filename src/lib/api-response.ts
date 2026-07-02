import { NextResponse } from "next/server";
import type { ApiError } from "@/types";

export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, string[]>
): NextResponse {
  const error: ApiError = { code, message, status, details };
  return NextResponse.json({ error }, { status });
}

export const ApiErrors = {
  unauthorized: () =>
    errorResponse("UNAUTHORIZED", "Authentication required.", 401),

  forbidden: () =>
    errorResponse("FORBIDDEN", "You do not have permission to perform this action.", 403),

  notFound: (resource = "Resource") =>
    errorResponse("NOT_FOUND", `${resource} not found.`, 404),

  conflict: (message: string) =>
    errorResponse("CONFLICT", message, 409),

  validation: (details: Record<string, string[]>) =>
    errorResponse("VALIDATION_ERROR", "Please correct the errors below.", 400, details),

  internal: () =>
    errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred. Please try again.",
      500
    ),

  rateLimited: () =>
    errorResponse("RATE_LIMITED", "Too many requests. Please slow down.", 429),

  businessLogic: (message: string) =>
    errorResponse("BUSINESS_LOGIC_ERROR", message, 422),
} as const;
