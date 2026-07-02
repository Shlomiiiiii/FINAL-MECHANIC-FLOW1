import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { recordPaymentSchema } from "@/lib/validations/invoice";
import { reconcileInvoiceAfterPayment, logInvoiceEvent } from "@/lib/invoice-utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");

    const payments = await prisma.payment.findMany({
      where: { invoiceId: id, organizationId: user.organizationId },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    return successResponse({ payments });
  } catch (err) {
    console.error("GET payments:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, totalCents: true, amountPaidCents: true, balanceCents: true, status: true, customerId: true },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");
    if (invoice.status === "CANCELLED") return ApiErrors.businessLogic("Cannot record payment on a cancelled invoice.");
    if (invoice.balanceCents <= 0) return ApiErrors.businessLogic("Invoice is already fully paid.");

    const body   = await request.json();
    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;
    if (data.amountCents > invoice.balanceCents) {
      return ApiErrors.businessLogic(
        `Payment amount ($${(data.amountCents / 100).toFixed(2)}) exceeds balance ($${(invoice.balanceCents / 100).toFixed(2)}).`
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const pmt = await tx.payment.create({
        data: {
          organizationId: user.organizationId,
          invoiceId:      id,
          customerId:     invoice.customerId,
          amountCents:    data.amountCents,
          method:         data.method,
          status:         "SUCCEEDED",
          notes:          data.notes,
          stripePaymentIntentId: data.stripePaymentIntentId,
          processedAt:    data.processedAt ? new Date(data.processedAt) : new Date(),
          createdById:    user.id,
        },
      });

      // Update invoice paid amount
      await tx.invoice.update({
        where: { id },
        data: { amountPaidCents: { increment: data.amountCents } },
      });

      // Reconcile status
      await reconcileInvoiceAfterPayment(id, tx);

      return pmt;
    });

    const eventType = invoice.amountPaidCents + data.amountCents >= invoice.totalCents ? "paid" : "partial_paid";
    await logInvoiceEvent(id, eventType, {
      userId: user.id,
      note: `$${(data.amountCents / 100).toFixed(2)} received via ${data.method.toLowerCase()}`,
      metadata: { paymentId: payment.id, amountCents: data.amountCents, method: data.method },
    });

    // Update customer lifetime value
    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: {
        lifetimeRevenueCents: { increment: data.amountCents },
        lastServiceAt: new Date(),
      },
    });

    return successResponse({ payment }, 201);
  } catch (err) {
    console.error("POST /payments:", err);
    return ApiErrors.internal();
  }
}
