import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { refundSchema } from "@/lib/validations/invoice";
import { reconcileInvoiceAfterPayment, logInvoiceEvent } from "@/lib/invoice-utils";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const payment = await prisma.payment.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, invoiceId: true, amountCents: true, refundAmountCents: true, status: true, customerId: true },
    });
    if (!payment) return ApiErrors.notFound("Payment");
    if (payment.status === "REFUNDED") return ApiErrors.businessLogic("Payment is already fully refunded.");

    const body   = await request.json();
    const parsed = refundSchema.safeParse(body);
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
    const alreadyRefunded = payment.refundAmountCents ?? 0;
    const maxRefund = payment.amountCents - alreadyRefunded;
    if (data.amountCents > maxRefund) {
      return ApiErrors.businessLogic(
        `Refund amount ($${(data.amountCents / 100).toFixed(2)}) exceeds refundable amount ($${(maxRefund / 100).toFixed(2)}).`
      );
    }

    const isFullRefund = data.amountCents >= maxRefund;

    await prisma.$transaction(async (tx) => {
      // Update payment
      await tx.payment.update({
        where: { id },
        data: {
          status: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
          refundedAt: new Date(),
          refundAmountCents: (alreadyRefunded + data.amountCents),
          refundReason: data.reason,
          stripeRefundId: data.stripeRefundId,
        },
      });

      // Deduct from invoice paid amount
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { amountPaidCents: { decrement: data.amountCents } },
      });

      await reconcileInvoiceAfterPayment(payment.invoiceId, tx);

      // Adjust customer lifetime value
      await tx.customer.update({
        where: { id: payment.customerId },
        data: { lifetimeRevenueCents: { decrement: data.amountCents } },
      });
    });

    await logInvoiceEvent(payment.invoiceId, "refunded", {
      userId: user.id,
      note: `Refund of $${(data.amountCents / 100).toFixed(2)}${data.reason ? ` — ${data.reason}` : ""}`,
      metadata: { paymentId: id, amountCents: data.amountCents, isFullRefund } as any,
    });

    return successResponse({ success: true, refundAmountCents: data.amountCents });
  } catch (err) {
    console.error("POST /refund:", err);
    return ApiErrors.internal();
  }
}
