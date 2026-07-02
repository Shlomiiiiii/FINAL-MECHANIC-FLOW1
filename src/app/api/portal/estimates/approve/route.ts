import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { estimateId, name } = body as { estimateId: string; name: string };
    if (!estimateId || !name?.trim()) return ApiErrors.validation({ name: ["Your name is required"] });

    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId },
      select: { id: true, status: true, organizationId: true },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");
    if (!["DRAFT","SENT"].includes(estimate.status)) {
      return ApiErrors.businessLogic("This estimate can no longer be approved.");
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? undefined;

    const updated = await prisma.estimate.update({
      where: { id: estimateId },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByName: name.trim(), approvedIp: ip },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: estimate.organizationId,
        action: "UPDATED",
        resourceType: "estimate",
        resourceId: estimateId,
        changes: { status: ["SENT","APPROVED"] },
        ipAddress: ip,
        metadata: { event: "customer_approved", approvedByName: name },
      },
    });

    return successResponse({ estimate: updated });
  } catch (err) {
    console.error("portal approve:", err);
    return ApiErrors.internal();
  }
}
