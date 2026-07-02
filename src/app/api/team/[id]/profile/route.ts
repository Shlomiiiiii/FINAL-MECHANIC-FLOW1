import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    if (user.role === "TECHNICIAN" && id !== user.id) return ApiErrors.forbidden();

    const body = await request.json();
    const allowedFields = [
      "firstName","lastName","middleName","preferredName","dateOfBirth",
      "personalEmail","personalPhone","workPhone",
      "addressLine1","addressLine2","city","state","zip",
      "emergencyName","emergencyPhone","emergencyRelation","emergencyEmail",
      "payrollId","payrollProvider","ssn_last4",
      "driversLicenseNo","driversLicenseState","driversLicenseExpiry",
      "startDate","endDate","terminationReason","managerUserId",
      "aseCertifications","preferredJobTypes","uniformSize","notes","profilePhotoUrl",
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) updateData[key] = body[key];
    }
    if (body.dateOfBirth) updateData.dateOfBirth = new Date(body.dateOfBirth);
    if (body.startDate)   updateData.startDate   = new Date(body.startDate);
    if (body.endDate)     updateData.endDate     = new Date(body.endDate);

    // HR fields restricted to manager+
    const hrOnlyFields = ["payrollId","payrollProvider","ssn_last4","terminationReason","endDate"];
    if (user.role === "TECHNICIAN" && hrOnlyFields.some(f => f in updateData)) {
      return ApiErrors.forbidden();
    }

    const profile = await prisma.employeeProfile.upsert({
      where: { userId: id },
      create: {
        organizationId: user.organizationId,
        userId:         id,
        firstName:      body.firstName ?? "",
        lastName:       body.lastName  ?? "",
        ...updateData,
      },
      update: updateData,
    });

    return successResponse({ profile });
  } catch (err) {
    console.error("PATCH /team/[id]/profile:", err);
    return ApiErrors.internal();
  }
}
