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

    const body  = await request.json();
    const { jobId } = body as { jobId: string };
    if (!jobId) return ApiErrors.validation({ jobId: ["Required"] });

    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId: user.organizationId, deletedAt: null },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        customer: { select: { id: true } },
        vehicle: { select: { id: true } },
        invoices: { select: { id: true } },
      },
    });
    if (!job) return ApiErrors.notFound("Job");
    if (job.invoices.length > 0) {
      return ApiErrors.businessLogic("This job already has an invoice. Open it from the job page.");
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { taxRatePct: true, invoiceTerms: true },
    });

    const lineItemInputs = job.lineItems.map((li) => ({
      itemType: li.itemType as "LABOR" | "PART" | "FEE" | "DISCOUNT",
      description: li.description,
      quantity: Number(li.quantity),
      unitCostCents: 0,
      unitPriceCents: li.unitPriceCents,
      taxable: li.taxable,
      laborHours: li.laborHours ? Number(li.laborHours) : undefined,
      technicianId: li.technicianId ?? undefined,
      jobLineItemId: li.id,
    }));

    const { invoiceNumber } = await getNextInvoiceNumber(user.organizationId);
    const taxRate = Number(org?.taxRatePct ?? 0);
    const totals  = computeTotals(lineItemInputs, taxRate);
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          organizationId: user.organizationId,
          customerId:   job.customerId,
          vehicleId:    job.vehicleId ?? undefined,
          jobId:        job.id,
          invoiceNumber,
          status:       "DRAFT",
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

      // Update job status to INVOICED
      await tx.job.update({ where: { id: jobId }, data: { status: "INVOICED" } });
      await tx.invoiceEvent.create({
        data: { invoiceId: inv.id, userId: user.id, eventType: "created",
          note: `Invoice created from job ${job.jobNumber}`, metadata: { jobId, jobNumber: job.jobNumber } as any },
      });

      return inv;
    });

    return successResponse({ invoice }, 201);
  } catch (err) {
    console.error("POST /from-job:", err);
    return ApiErrors.internal();
  }
}
