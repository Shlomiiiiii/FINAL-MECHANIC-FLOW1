import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { communicationLogSchema } from "@/lib/validations/customer";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const exists = await prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) return ApiErrors.notFound("Customer");

    const logs = await prisma.communicationLog.findMany({
      where: { customerId: id, organizationId: user.organizationId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse({ communications: logs });
  } catch (error) {
    console.error("GET communications:", error);
    return ApiErrors.internal();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const exists = await prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) return ApiErrors.notFound("Customer");

    const body = await request.json();
    const parsed = communicationLogSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const log = await prisma.communicationLog.create({
      data: {
        organizationId: user.organizationId,
        customerId: id,
        userId: user.id,
        type: parsed.data.type,
        direction: parsed.data.direction,
        subject: parsed.data.subject,
        body: parsed.data.body,
        referenceType: parsed.data.referenceType,
        referenceId: parsed.data.referenceId,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });

    return successResponse({ communication: log }, 201);
  } catch (error) {
    console.error("POST communications:", error);
    return ApiErrors.internal();
  }
}
