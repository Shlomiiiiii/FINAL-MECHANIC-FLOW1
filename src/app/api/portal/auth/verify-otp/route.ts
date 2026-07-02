import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPortalOtp, createPortalSession, logPortalAction } from "@/lib/portal/auth";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  code:  z.string().length(6),
  slug:  z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { email, code, slug } = parsed.data;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ua = request.headers.get("user-agent") ?? undefined;

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, customerPortalEnabled: true },
    });
    if (!org || !org.customerPortalEnabled) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const customer = await prisma.customer.findFirst({
      where: { organizationId: org.id, email: { equals: email, mode: "insensitive" }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    const result = await verifyPortalOtp({ customerId: customer.id, code });
    if (!result.success) {
      await logPortalAction({
        organizationId: org.id, customerId: customer.id,
        action: "login_failed", success: false,
        errorMessage: result.error, ipAddress: ip, userAgent: ua,
      });
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    await createPortalSession({
      customerId: customer.id, organizationId: org.id, ipAddress: ip, userAgent: ua,
    });

    await logPortalAction({
      organizationId: org.id, customerId: customer.id,
      action: "login", ipAddress: ip, userAgent: ua,
    });

    return NextResponse.json({
      success: true,
      customer: { firstName: customer.firstName, lastName: customer.lastName },
    });
  } catch (err) {
    console.error("POST /api/portal/auth/verify-otp:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
