import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { estimateId, name, reason } = body as { estimateId: string; name: string; reason?: string };
    if (!estimateId || !name?.trim()) return ApiErrors.validation({ name: ["Required"] });
    if (!reason?.trim()) return ApiErrors.validation({ reason: ["Please describe the changes needed"] });

    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId },
      select: { id: true, status: true, organizationId: true },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");

    await prisma.estimate.update({
      where: { id: estimateId },
      data: { changeRequestedAt: new Date(), changeRequestNote: `${name.trim()}: ${reason.trim()}` },
    });

    return successResponse({ success: true });
  } catch (err) {
    console.error("portal change-request:", err);
    return ApiErrors.internal();
  }
}
