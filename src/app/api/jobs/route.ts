import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { jobSchema } from "@/lib/validations/job";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { generateJobNumber } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "25"), 100);

    const where = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(status ? { status: status as any } : {}),
      // Technicians only see assigned jobs
      ...(user.role === "TECHNICIAN"
        ? { assignments: { some: { userId: user.id } } }
        : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phonePrimary: true } },
          vehicle: { select: { id: true, year: true, make: true, model: true } },
          assignments: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
          _count: { select: { lineItems: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.job.count({ where }),
    ]);

    const hasMore = jobs.length > limit;
    const data = hasMore ? jobs.slice(0, -1) : jobs;

    return successResponse({
      jobs: data,
      pagination: { cursor: hasMore ? data[data.length - 1]?.id ?? null : null, hasMore, total },
    });
  } catch (error) {
    console.error("GET /api/jobs error:", error);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    if (user.role === "TECHNICIAN") return ApiErrors.forbidden();

    const body = await request.json();
    const parsed = jobSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;

    // Get next job number atomically
    const org = await prisma.organization.update({
      where: { id: user.organizationId },
      data: { invoiceCounter: { increment: 1 } },
      select: { invoiceCounter: true },
    });

    const jobNumber = generateJobNumber(org.invoiceCounter);

    const job = await prisma.job.create({
      data: {
        organizationId: user.organizationId,
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        jobNumber,
        title: data.title,
        description: data.description,
        jobType: data.jobType,
        priority: data.priority,
        internalNotes: data.internalNotes,
        customerNotes: data.customerNotes,
        createdById: user.id,
        assignments: data.assignedUserIds?.length
          ? {
              create: data.assignedUserIds.map((userId, i) => ({
                organizationId: user.organizationId,
                userId,
                isLead: i === 0,
                assignedById: user.id,
              })),
            }
          : undefined,
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        vehicle: { select: { id: true, year: true, make: true, model: true } },
        assignments: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });

    return successResponse({ job }, 201);
  } catch (error) {
    console.error("POST /api/jobs error:", error);
    return ApiErrors.internal();
  }
}
