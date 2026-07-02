import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { vehicleSchema } from "@/lib/validations/vehicle";
import { successResponse, ApiErrors } from "@/lib/api-response";

async function ownsVehicle(vehicleId: string, organizationId: string) {
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId, deletedAt: null },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, phonePrimary: true, email: true },
        },
        jobs: {
          where: { deletedAt: null },
          include: {
            lineItems: { include: { inventoryItem: { select: { name: true } } } },
            assignments: {
              include: { user: { select: { id: true, fullName: true } } },
              where: { isLead: true },
              take: 1,
            },
            invoices: { select: { id: true, invoiceNumber: true, totalCents: true, status: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        maintenanceReminders: {
          where: { isActive: true },
          orderBy: [{ dueDate: "asc" }, { dueMiles: "asc" }],
        },
      },
    });

    if (!vehicle) return ApiErrors.notFound("Vehicle");

    // Compute totals
    const totalSpent = vehicle.jobs
      .filter((j) => ["COMPLETED", "INVOICED", "CLOSED"].includes(j.status))
      .reduce((sum, j) => sum + j.totalCents, 0);

    const openJobs = vehicle.jobs.filter(
      (j) => !["COMPLETED", "INVOICED", "CLOSED", "CANCELLED"].includes(j.status)
    );

    return successResponse({
      vehicle: {
        ...vehicle,
        _computed: { totalSpentCents: totalSpent, openJobCount: openJobs.length },
      },
    });
  } catch (error) {
    console.error("GET /api/vehicles/[id]:", error);
    return ApiErrors.internal();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const existing = await ownsVehicle(id, user.organizationId);
    if (!existing) return ApiErrors.notFound("Vehicle");

    const body = await request.json();
    const parsed = vehicleSchema.safeParse(body);

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

    // Update mileage timestamp if mileage changed
    const mileageUpdatedAt =
      data.mileageLastSeen !== undefined && data.mileageLastSeen !== existing.mileageLastSeen
        ? new Date()
        : undefined;

    // Build change diff for audit
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [key, newVal] of Object.entries(data)) {
      const oldVal = (existing as Record<string, unknown>)[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = [oldVal, newVal];
      }
    }

    const updated = await prisma.vehicle.update({
      where: { id },
      data: {
        ...data,
        ...(mileageUpdatedAt ? { mileageUpdatedAt } : {}),
      },
    });

    if (Object.keys(changes).length > 0) {
      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "UPDATED",
          resourceType: "vehicle",
          resourceId: id,
          changes,
        },
      });
    }

    return successResponse({ vehicle: updated });
  } catch (error) {
    console.error("PATCH /api/vehicles/[id]:", error);
    return ApiErrors.internal();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER", "MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const existing = await ownsVehicle(id, user.organizationId);
    if (!existing) return ApiErrors.notFound("Vehicle");

    await prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "DELETED",
        resourceType: "vehicle",
        resourceId: id,
      },
    });

    return successResponse({ success: true });
  } catch (error) {
    console.error("DELETE /api/vehicles/[id]:", error);
    return ApiErrors.internal();
  }
}
