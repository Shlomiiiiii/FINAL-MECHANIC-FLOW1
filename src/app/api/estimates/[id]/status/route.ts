import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

const VALID_INTERNAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "APPROVED", "DECLINED"],
  SENT: ["APPROVED", "DECLINED", "EXPIRED", "DRAFT"],
  APPROVED: ["CONVERTED"],
  DECLINED: ["DRAFT"],
  EXPIRED: ["DRAFT"],
  CONVERTED: [],
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");

    const body = await request.json();
    const { status, reason } = body as { status: string; reason?: string };

    const allowed = VALID_INTERNAL_TRANSITIONS[estimate.status] ?? [];
    if (!allowed.includes(status)) {
      return ApiErrors.businessLogic(`Cannot transition from ${estimate.status} to ${status}.`);
    }

    const data: Record<string, unknown> = { status };
    if (status === "APPROVED") { data.approvedAt = new Date(); }
    if (status === "DECLINED") { data.declinedAt = new Date(); data.declineReason = reason; }
    if (status === "EXPIRED") { data.declinedAt = new Date(); }

    const updated = await prisma.estimate.update({ where: { id }, data });
    return successResponse({ estimate: updated });
  } catch (err) {
    console.error("POST status:", err);
    return ApiErrors.internal();
  }
}
