import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const updateSchema = z.object({
  fullName:         z.string().min(1).max(200).optional(),
  phone:            z.string().optional(),
  color:            z.string().optional(),
  role:             z.enum(["OWNER","MANAGER","TECHNICIAN","OFFICE_STAFF"]).optional(),
  isActive:         z.boolean().optional(),
  employeeId:       z.string().optional(),
  position:         z.string().optional(),
  department:       z.string().optional(),
  hireDate:         z.string().nullable().optional(),
  employmentStatus: z.enum(["full_time","part_time","contract","intern","terminated"]).optional(),
  hourlyRate:       z.number().int().min(0).optional(),
  salaryYearly:     z.number().int().min(0).optional(),
  commissionPct:    z.number().min(0).max(100).optional(),
  overtimeRate:     z.number().min(1).max(4).optional(),
  skillLevel:       z.enum(["junior","mid","senior","master"]).optional(),
  specialties:      z.array(z.string()).optional(),
  avatarUrl:        z.string().url().optional(),
  notifyJobAssigned:      z.boolean().optional(),
  notifyEstimateApproved: z.boolean().optional(),
  notifyInvoicePaid:      z.boolean().optional(),
  notifySmsEnabled:       z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    // Technicians can only view themselves
    if (user.role === "TECHNICIAN" && id !== user.id) return ApiErrors.forbidden();

    const employee = await prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        employeeProfile: true,
        certifications: {
          orderBy: [{ isActive: "desc" }, { expiresAt: "asc" }],
        },
        clockEntries: {
          orderBy: { clockedInAt: "desc" },
          take: 10,
        },
        performanceReviews: {
          where: { userId: id },
          orderBy: { reviewDate: "desc" },
          take: 5,
          include: { reviewedBy: { select: { fullName: true } } },
        },
        availability: {
          orderBy: { dayOfWeek: "asc" },
        },
        timeOff: {
          where: { endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
        },
        _count: {
          select: {
            jobAssignments: true,
            timeEntries: true,
          },
        },
      },
    });

    if (!employee) return ApiErrors.notFound("Employee");

    // Compute performance metrics from actual job data
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [jobStats, hoursThisMonth] = await Promise.all([
      prisma.jobAssignment.findMany({
        where: {
          userId:   id,
          job: {
            organizationId: user.organizationId,
            status:         { in: ["COMPLETED","INVOICED","CLOSED"] },
            completedAt:    { gte: thirtyDaysAgo },
          },
        },
        include: { job: { select: { totalCents: true, completedAt: true } } },
      }),
      prisma.employeeClockEntry.aggregate({
        where: {
          userId:         id,
          organizationId: user.organizationId,
          clockedInAt:    { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
          status:         { not: "open" },
        },
        _sum: { totalMinutes: true },
      }),
    ]);

    const revenueThisMonth = jobStats.reduce((s, ja) => s + (ja.job.totalCents ?? 0), 0);

    return successResponse({
      employee: {
        ...employee,
        _metrics: {
          jobsLast30Days:   jobStats.length,
          revenueThisMonth,
          hoursThisMonth:   Math.round((hoursThisMonth._sum.totalMinutes ?? 0) / 60 * 10) / 10,
        },
      },
    });
  } catch (err) {
    console.error("GET /api/team/[id]:", err);
    return ApiErrors.internal();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    // Technicians can only edit their own notification prefs
    if (user.role === "TECHNICIAN") {
      if (id !== user.id) return ApiErrors.forbidden();
    } else if (!["OWNER","MANAGER"].includes(user.role)) {
      return ApiErrors.forbidden();
    }

    const target = await prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, role: true },
    });
    if (!target) return ApiErrors.notFound("Employee");

    // Only owners can promote to owner
    const body   = await request.json();
    if (body.role === "OWNER" && user.role !== "OWNER") return ApiErrors.forbidden();

    const parsed = updateSchema.safeParse(body);
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
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) updateData[k] = v;
    }
    if (data.hireDate !== undefined) {
      updateData.hireDate = data.hireDate ? new Date(data.hireDate) : null;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, fullName: true, email: true, role: true,
        position: true, department: true, isActive: true, employmentStatus: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId:         user.id,
        action:         "UPDATED",
        resourceType:   "employee",
        resourceId:     id,
        changes:        data as any,
      },
    });

    return successResponse({ employee: updated });
  } catch (err) {
    console.error("PATCH /api/team/[id]:", err);
    return ApiErrors.internal();
  }
}
