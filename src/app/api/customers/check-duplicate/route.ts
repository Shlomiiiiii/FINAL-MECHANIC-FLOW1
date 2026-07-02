import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.toLowerCase().trim();
    const phone = searchParams.get("phone")?.replace(/\D/g, "");
    const excludeId = searchParams.get("excludeId");

    if (!email && !phone) return successResponse({ duplicate: null });

    const orClauses = [];
    if (email) orClauses.push({ email });
    if (phone) {
      orClauses.push({ phonePrimary: { contains: phone } });
    }

    const existing = await prisma.customer.findFirst({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        OR: orClauses,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phonePrimary: true,
        companyName: true,
      },
    });

    return successResponse({ duplicate: existing ?? null });
  } catch (error) {
    console.error("check-duplicate:", error);
    return ApiErrors.internal();
  }
}
