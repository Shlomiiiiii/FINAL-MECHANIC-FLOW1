import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body as { token: string };
    if (!token) return ApiErrors.validation({ token: ["Required"] });

    const invoice = await prisma.invoice.findUnique({
      where: { paymentLinkToken: token },
      select: { id: true, status: true },
    });
    if (!invoice) return ApiErrors.notFound("Invoice");

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const ua = request.headers.get("user-agent") ?? undefined;

    await prisma.invoiceView.create({ data: { invoiceId: invoice.id, ipAddress: ip, userAgent: ua } });
    if (!["VIEWED","PARTIALLY_PAID","PAID","CANCELLED"].includes(invoice.status)) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VIEWED", viewedAt: new Date() } });
    }

    return successResponse({ success: true });
  } catch (err) {
    console.error("portal/view:", err);
    return ApiErrors.internal();
  }
}
