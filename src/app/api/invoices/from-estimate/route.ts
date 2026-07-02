import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { computeTotals, getNextInvoiceNumber, buildLineItemCreateData, logInvoiceEvent } from "@/lib/invoice-utils";

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();

    const body = await request.json();
    const { estimateId } = body as { estimateId: string };
    if (!estimateId) return ApiErrors.validation({ estimateId: ["Required"] });

    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId, organizationId: user.organizationId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!estimate) return ApiErrors.notFound("Estimate");
    if (!["APPROVED","SENT","DRAFT"].includes(estimate.status)) {
      return ApiErrors.businessLogic("Only approved estimates can be converted to invoices.");
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { taxRatePct: true, invoiceTerms: true },
    });

    const lineItemInputs = estimate.lineItems.map((li) => ({
      itemType: li.itemType as "LABOR" | "PART" | "FEE" | "DISCOUNT",
      description: li.description,
      quantity: Number(li.quantity),
      unitCostCents: li.unitCostCents,
      unitPriceCents: li.unitPriceCents,
      taxable: li.taxable,
      category: li.category ?? undefined,
      warranty: li.warranty ?? undefined,
      laborHours: li.laborHours ? Number(li.laborHours) : undefined,
      estimateLineItemId: li.id,
    }));

    const { invoiceNumber } = await getNextInvoiceNumber(user.organizationId);
    const taxRate = Number(org?.taxRatePct ?? 0);
    const totals  = computeTotals(lineItemInputs, taxRate, 0, estimate.depositCents);
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          organizationId: user.organizationId,
          customerId:   estimate.customerId,
          vehicleId:    estimate.vehicleId ?? undefined,
          jobId:        estimate.jobId ?? undefined,
          estimateId:   estimate.id,
          invoiceNumber,
          status:       "DRAFT",
          warrantyText: estimate.warrantyText ?? undefined,
          depositCents: estimate.depositCents,
          terms:        org?.invoiceTerms ?? undefined,
          dueDate,
          subtotalCents:  totals.subtotalCents,
          taxCents:       totals.taxCents,
          discountCents:  totals.discountCents,
          totalCents:     totals.totalCents,
          amountPaidCents: 0,
          balanceCents:   totals.totalCents,
          createdById:    user.id,
          lineItems: { createMany: { data: buildLineItemCreateData(lineItemInputs, user.organizationId) } },
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          lineItems: { orderBy: { sortOrder: "asc" } },
        },
      });

      await tx.invoiceEvent.create({
        data: { invoiceId: inv.id, userId: user.id, eventType: "created",
          note: `Invoice created from estimate ${estimate.estimateNumber}`, metadata: { estimateId } as any },
      });

      return inv;
    });

    return successResponse({ invoice }, 201);
  } catch (err) {
    console.error("POST /from-estimate:", err);
    return ApiErrors.internal();
  }
}
