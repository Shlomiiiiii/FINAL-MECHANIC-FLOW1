import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();

    const { searchParams } = new URL(request.url);
    const since  = searchParams.get("since");  // ISO datetime — for polling
    const jobId  = searchParams.get("jobId");
    const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (since)  where.createdAt = { gte: new Date(since) };
    if (jobId)  where.jobId     = jobId;

    const events = await prisma.dispatchEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    limit,
    });

    return successResponse({ events, count: events.length });
  } catch (err) {
    console.error("GET /api/dispatch/events:", err);
    return ApiErrors.internal();
  }
}
