import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { logInvoiceEvent } from "@/lib/invoice-utils";

const ALLOWED: Record<string, string[]> = {
  DRAFT:          ["SENT"],
  SENT:           ["DRAFT","OVERDUE","CANCELLED"],
  VIEWED:         ["DRAFT","OVERDUE","CANCELLED"],
  PARTIALLY_PAID: ["OVERDUE","CANCELLED"],
  PAID:           ["ARCHIVED","REFUNDED"],
  OVERDUE:        ["CANCELLED","SENT"],
  REFUNDED:       ["ARCHIVED"],
  CANCELLED:      ["ARCHIVED"],
  ARCHIVED:       [],
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");

    const body = await request.json();
    const { status, note } = body as { status: string; note?: string };

    const allowed = ALLOWED[invoice.status] ?? [];
    if (!allowed.includes(status)) {
      return ApiErrors.businessLogic(`Cannot transition invoice from ${invoice.status} to ${status}.`);
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: status as any },
    });

    await logInvoiceEvent(id, "status_changed", {
      userId: user.id,
      note: note ?? `Status changed to ${status}`,
      metadata: { from: invoice.status, to: status },
    });

    return successResponse({ invoice: updated });
  } catch (err) {
    console.error("POST /status:", err);
    return ApiErrors.internal();
  }
}
