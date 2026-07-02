import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { maintenanceReminderSchema } from "@/lib/validations/vehicle";
import { successResponse, ApiErrors } from "@/lib/api-response";

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
      select: { id: true, mileageLastSeen: true },
    });
    if (!vehicle) return ApiErrors.notFound("Vehicle");

    const reminders = await prisma.maintenanceReminder.findMany({
      where: { vehicleId: id, organizationId: user.organizationId },
      orderBy: [{ isActive: "desc" }, { dueDate: "asc" }],
    });

    // Compute status for each reminder
    const currentMileage = vehicle.mileageLastSeen ?? 0;
    const today = new Date();

    const enriched = reminders.map((r) => {
      let status: "overdue" | "due_soon" | "ok" | "unknown" = "unknown";

      const mileageOverdue = r.dueMiles && currentMileage >= r.dueMiles;
      const dateOverdue = r.dueDate && r.dueDate < today;
      const mileageDueSoon = r.dueMiles && (r.dueMiles - currentMileage) <= 500;
      const dateDueSoon =
        r.dueDate &&
        r.dueDate >= today &&
        r.dueDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (mileageOverdue || dateOverdue) {
        status = "overdue";
      } else if (mileageDueSoon || dateDueSoon) {
        status = "due_soon";
      } else if (r.dueMiles || r.dueDate) {
        status = "ok";
      }

      return { ...r, _status: status };
    });

    return successResponse({ reminders: enriched });
  } catch (error) {
    console.error("GET maintenance:", error);
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

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) return ApiErrors.notFound("Vehicle");

    const body = await request.json();
    const parsed = maintenanceReminderSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const reminder = await prisma.maintenanceReminder.create({
      data: {
        organizationId: user.organizationId,
        vehicleId: id,
        ...parsed.data,
      },
    });

    return successResponse({ reminder }, 201);
  } catch (error) {
    console.error("POST maintenance:", error);
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
    const { id: vehicleId } = await params;

    const body = await request.json();
    const { reminderId, ...rest } = body;
    if (!reminderId) return ApiErrors.validation({ reminderId: ["Required"] });

    const existing = await prisma.maintenanceReminder.findFirst({
      where: { id: reminderId, vehicleId, organizationId: user.organizationId },
    });
    if (!existing) return ApiErrors.notFound("Reminder");

    const parsed = maintenanceReminderSchema.partial().safeParse(rest);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const updated = await prisma.maintenanceReminder.update({
      where: { id: reminderId },
      data: parsed.data,
    });

    return successResponse({ reminder: updated });
  } catch (error) {
    console.error("PATCH maintenance:", error);
    return ApiErrors.internal();
  }
}
