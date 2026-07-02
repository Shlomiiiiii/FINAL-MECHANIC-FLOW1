import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";

const createEmployeeSchema = z.object({
  // Auth / User fields
  email:     z.string().email("Valid email required"),
  fullName:  z.string().min(1).max(200),
  password:  z.string().min(8, "Password must be at least 8 characters").optional(),
  role:      z.enum(["OWNER","MANAGER","TECHNICIAN","OFFICE_STAFF"]).default("TECHNICIAN"),
  phone:     z.string().optional(),
  color:     z.string().optional(),
  // Employment
  employeeId:       z.string().optional(),
  position:         z.string().optional(),
  department:       z.string().optional(),
  hireDate:         z.string().optional(),
  employmentStatus: z.enum(["full_time","part_time","contract","intern"]).default("full_time"),
  // Compensation
  hourlyRate:    z.number().int().min(0).optional(),   // cents
  salaryYearly:  z.number().int().min(0).optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  overtimeRate:  z.number().min(1).max(4).optional(),
  // Technician
  skillLevel:   z.enum(["junior","mid","senior","master"]).optional(),
  specialties:  z.array(z.string()).optional().default([]),
  // Profile
  profilePhotoUrl: z.string().url().optional(),
  // HR detail (EmployeeProfile)
  profile: z.object({
    firstName:      z.string().optional(),
    lastName:       z.string().optional(),
    personalPhone:  z.string().optional(),
    addressLine1:   z.string().optional(),
    city:           z.string().optional(),
    state:          z.string().optional(),
    zip:            z.string().optional(),
    emergencyName:  z.string().optional(),
    emergencyPhone: z.string().optional(),
    emergencyRelation: z.string().optional(),
    payrollId:      z.string().optional(),
    startDate:      z.string().optional(),
    managerUserId:  z.string().optional(),
    aseCertifications: z.array(z.string()).optional(),
    preferredJobTypes: z.array(z.string()).optional(),
    notes:          z.string().optional(),
  }).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const role       = searchParams.get("role");
    const department = searchParams.get("department");
    const status     = searchParams.get("status");
    const search     = searchParams.get("search")?.trim() ?? "";

    // Technicians see only themselves unless MANAGER+
    if (user.role === "TECHNICIAN") {
      const self = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          employeeProfile: true,
          certifications:  { where: { isActive: true } },
          clockEntries:    { where: { status: "open" }, take: 1 },
        },
      });
      return successResponse({ employees: self ? [self] : [], total: 1 });
    }

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      ...(role ? { role } : {}),
      ...(department ? { department } : {}),
    };

    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;
    if (status === "terminated") {
      where.employmentStatus = "terminated";
    } else {
      where.employmentStatus = { not: "terminated" };
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email:    { contains: search, mode: "insensitive" } },
        { position: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          employeeProfile: {
            select: {
              id: true, firstName: true, lastName: true,
              emergencyName: true, emergencyPhone: true,
              startDate: true, payrollId: true,
              aseCertifications: true, preferredJobTypes: true,
              profilePhotoUrl: true,
            },
          },
          certifications: {
            where: { isActive: true },
            orderBy: { expiresAt: "asc" },
          },
          clockEntries: {
            where: { status: "open" },
            take: 1,
            orderBy: { clockedInAt: "desc" },
          },
          _count: {
            select: {
              jobAssignments: true,
              timeEntries: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
      }),
      prisma.user.count({ where }),
    ]);

    return successResponse({ employees, total });
  } catch (err) {
    console.error("GET /api/team:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const body   = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);

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

    // Check email uniqueness within org
    const conflict = await prisma.user.findFirst({
      where: { organizationId: user.organizationId, email: data.email.toLowerCase() },
    });
    if (conflict) return ApiErrors.conflict(`An employee with email ${data.email} already exists.`);

    // Owner can only create one; only existing owner can promote to owner
    if (data.role === "OWNER" && user.role !== "OWNER") {
      return ApiErrors.forbidden();
    }

    const passwordHash = await hashPassword(
      data.password ?? `Welcome${new Date().getFullYear()}!`
    );

    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.user.create({
        data: {
          organizationId:   user.organizationId,
          email:            data.email.toLowerCase(),
          fullName:         data.fullName,
          passwordHash,
          role:             data.role,
          phone:            data.phone,
          color:            data.color,
          employeeId:       data.employeeId,
          position:         data.position,
          department:       data.department,
          hireDate:         data.hireDate ? new Date(data.hireDate) : undefined,
          employmentStatus: data.employmentStatus,
          hourlyRate:       data.hourlyRate,
          salaryYearly:     data.salaryYearly,
          commissionPct:    data.commissionPct,
          overtimeRate:     data.overtimeRate,
          skillLevel:       data.skillLevel,
          specialties:      data.specialties ?? [],
          profilePhotoUrl:  data.profilePhotoUrl,
          avatarUrl:        data.profilePhotoUrl,
          isActive:         true,
        },
      });

      // Create EmployeeProfile
      const p = data.profile ?? {};
      await tx.employeeProfile.create({
        data: {
          organizationId: user.organizationId,
          userId:         emp.id,
          firstName:      p.firstName ?? data.fullName.split(" ")[0],
          lastName:       p.lastName  ?? data.fullName.split(" ").slice(1).join(" "),
          personalPhone:  p.personalPhone,
          addressLine1:   p.addressLine1,
          city:           p.city,
          state:          p.state,
          zip:            p.zip,
          emergencyName:  p.emergencyName,
          emergencyPhone: p.emergencyPhone,
          emergencyRelation: p.emergencyRelation,
          payrollId:      p.payrollId,
          startDate:      p.startDate ? new Date(p.startDate) : (data.hireDate ? new Date(data.hireDate) : undefined),
          managerUserId:  p.managerUserId,
          aseCertifications: p.aseCertifications ?? [],
          preferredJobTypes: p.preferredJobTypes ?? [],
          notes:          p.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId:         user.id,
          action:         "CREATED",
          resourceType:   "employee",
          resourceId:     emp.id,
          metadata:       { fullName: emp.fullName, role: emp.role } as any,
        },
      });

      return emp;
    });

    return successResponse({ employee }, 201);
  } catch (err) {
    console.error("POST /api/team:", err);
    return ApiErrors.internal();
  }
}
