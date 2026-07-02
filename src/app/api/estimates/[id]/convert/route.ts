import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { generateJobNumber } from "@/lib/utils";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        customer: { select: { id: true } },
      },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");
    if (!["APPROVED", "SENT", "DRAFT"].includes(estimate.status)) {
      return ApiErrors.businessLogic("Only approved, sent, or draft estimates can be converted.");
    }
    if (estimate.jobId) {
      return ApiErrors.businessLogic("This estimate is already linked to a job.");
    }

    const body = await request.json().catch(() => ({}));
    const target = (body.target as string) ?? "job"; // 'job' | 'invoice'

    // Bump job counter
    const org = await prisma.organization.update({
      where: { id: user.organizationId },
      data: { jobCounter: { increment: 1 } },
      select: { jobCounter: true },
    });
    const jobNumber = generateJobNumber(org.jobCounter);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the job
      const job = await tx.job.create({
        data: {
          organizationId: user.organizationId,
          customerId: estimate.customerId,
          vehicleId: estimate.vehicleId ?? undefined,
          jobNumber,
          title: estimate.title,
          description: estimate.notes ?? undefined,
          customerNotes: estimate.notes ?? undefined,
          status: "APPROVED",
          subtotalCents: estimate.subtotalCents,
          taxCents: estimate.taxCents,
          discountCents: estimate.discountCents,
          totalCents: estimate.totalCents,
          createdById: user.id,
          // Copy line items
          lineItems: {
            create: estimate.lineItems.map((li, idx) => ({
              organizationId: user.organizationId,
              itemType: li.itemType,
              inventoryItemId: li.inventoryItemId ?? undefined,
              description: li.description,
              quantity: li.quantity,
              unitPriceCents: li.unitPriceCents,
              totalCents: li.totalCents,
              taxable: li.taxable,
              laborHours: li.laborHours ?? undefined,
              sortOrder: idx,
            })),
          },
        },
      });

      // 2. Mark estimate as converted and link to job
      const updatedEstimate = await tx.estimate.update({
        where: { id },
        data: {
          status: "CONVERTED",
          jobId: job.id,
          approvedAt: estimate.approvedAt ?? new Date(),
        },
      });

      return { job, estimate: updatedEstimate };
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "UPDATED",
        resourceType: "estimate",
        resourceId: id,
        changes: { status: ["SENT", "CONVERTED"], jobId: [null, result.job.id] },
        metadata: { event: "estimate_converted", jobId: result.job.id, jobNumber },
      },
    });

    return successResponse({ job: result.job, estimate: result.estimate, jobNumber });
  } catch (err) {
    console.error("POST convert:", err);
    return ApiErrors.internal();
  }
}
