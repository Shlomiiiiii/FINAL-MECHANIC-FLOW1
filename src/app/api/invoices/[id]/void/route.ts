import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { logInvoiceEvent } from "@/lib/invoice-utils";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true, amountPaidCents: true },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");
    if (invoice.status === "CANCELLED") return ApiErrors.businessLogic("Invoice is already cancelled.");
    if (invoice.amountPaidCents > 0) {
      return ApiErrors.businessLogic("Cannot cancel an invoice with recorded payments. Issue a refund first.");
    }

    const body = await request.json().catch(() => ({}));
    const reason = (body.reason as string | undefined)?.trim();

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });

    await logInvoiceEvent(id, "cancelled", {
      userId: user.id,
      note: reason ?? "Invoice cancelled",
    });

    return successResponse({ invoice: updated });
  } catch (err) {
    console.error("POST /void:", err);
    return ApiErrors.internal();
  }
}
