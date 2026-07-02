import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { estimateId, name, reason } = body as { estimateId: string; name: string; reason?: string };
    if (!estimateId || !name?.trim()) return ApiErrors.validation({ name: ["Your name is required"] });

    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId },
      select: { id: true, status: true, organizationId: true },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");
    if (!["DRAFT","SENT"].includes(estimate.status)) {
      return ApiErrors.businessLogic("This estimate has already been processed.");
    }

    const updated = await prisma.estimate.update({
      where: { id: estimateId },
      data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason?.trim() },
    });

    return successResponse({ estimate: updated });
  } catch (err) {
    console.error("portal decline:", err);
    return ApiErrors.internal();
  }
}
