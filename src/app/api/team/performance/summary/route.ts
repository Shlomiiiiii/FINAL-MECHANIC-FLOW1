import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    const now  = new Date();
    const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = toStr   ? new Date(toStr)   : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all active employees
    const employees = await prisma.user.findMany({
      where: {
        organizationId:   user.organizationId,
        isActive:         true,
        employmentStatus: { not: "terminated" },
      },
      select: {
        id: true, fullName: true, role: true, position: true,
        department: true, color: true, avatarUrl: true,
        hourlyRate: true, skillLevel: true,
      },
    });

    const summaries = await Promise.all(employees.map(async (emp) => {
      const [jobStats, hoursData, clockData] = await Promise.all([
        // Jobs completed in period
        prisma.jobAssignment.findMany({
          where: {
            userId: emp.id,
            isLead: true,
            job: {
              organizationId: user.organizationId,
              completedAt: { gte: from, lte: to },
              status: { in: ["COMPLETED","INVOICED","CLOSED"] },
              deletedAt: null,
            },
          },
          include: {
            job: {
              select: {
                totalCents: true,
                subtotalCents: true,
                completedAt: true,
                createdAt: true,
              },
            },
          },
        }),
        // Labor hours (job time entries)
        prisma.timeEntry.aggregate({
          where: {
            userId:  emp.id,
            organizationId: user.organizationId,
            startedAt: { gte: from },
            endedAt:   { lte: to, not: null },
          },
          _sum: { durationSeconds: true },
        }),
        // Clock-in hours
        prisma.employeeClockEntry.aggregate({
          where: {
            userId:         emp.id,
            organizationId: user.organizationId,
            clockedInAt:    { gte: from, lte: to },
            status:         { not: "open" },
          },
          _sum: { totalMinutes: true, regularMinutes: true, overtimeMinutes: true },
        }),
      ]);

      const jobsCompleted    = jobStats.length;
      const revenueGenerated = jobStats.reduce((s, ja) => s + (ja.job.totalCents ?? 0), 0);
      const laborHoursSold   = Math.round((hoursData._sum.durationSeconds ?? 0) / 3600 * 10) / 10;
      const hoursWorked      = Math.round((clockData._sum.totalMinutes ?? 0) / 60 * 10) / 10;
      const overtimeHours    = Math.round((clockData._sum.overtimeMinutes ?? 0) / 60 * 10) / 10;

      // Efficiency = labor hours sold vs hours clocked in
      const efficiency = hoursWorked > 0
        ? Math.min(150, Math.round((laborHoursSold / hoursWorked) * 100))
        : 0;

      const avgJobValue = jobsCompleted > 0
        ? Math.round(revenueGenerated / jobsCompleted)
        : 0;

      return {
        employee: emp,
        jobsCompleted,
        revenueGeneratedCents: revenueGenerated,
        laborHoursSold,
        hoursWorked,
        overtimeHours,
        efficiencyPct: efficiency,
        avgJobValueCents: avgJobValue,
        // Static from User model (updated nightly by background job)
        avgRating:      emp.avgJobRating ?? null,
        comebackRate:   emp.comebackRate  ?? null,
      };
    }));

    // Sort by revenue desc by default
    summaries.sort((a, b) => b.revenueGeneratedCents - a.revenueGeneratedCents);

    // Team totals
    const totals = {
      totalRevenue:  summaries.reduce((s, e) => s + e.revenueGeneratedCents, 0),
      totalJobs:     summaries.reduce((s, e) => s + e.jobsCompleted, 0),
      totalHours:    Math.round(summaries.reduce((s, e) => s + e.hoursWorked, 0) * 10) / 10,
      avgEfficiency: summaries.length > 0
        ? Math.round(summaries.reduce((s, e) => s + e.efficiencyPct, 0) / summaries.length)
        : 0,
    };

    return successResponse({ summaries, totals, period: { from, to } });
  } catch (err) {
    console.error("GET /team/performance/summary:", err);
    return ApiErrors.internal();
  }
}
