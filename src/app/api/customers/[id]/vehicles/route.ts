import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const vehicleSchema = z.object({
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  trim: z.string().max(100).optional(),
  vin: z.string().max(17).optional(),
  licensePlate: z.string().max(20).optional(),
  color: z.string().max(50).optional(),
  engine: z.string().max(100).optional(),
  transmission: z.string().max(50).optional(),
  fuelType: z.enum(["gasoline", "diesel", "hybrid", "electric", "other"]).optional(),
  mileageLastSeen: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return ApiErrors.notFound("Customer");

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

    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: user.organizationId,
        customerId: id,
        ...parsed.data,
        mileageUpdatedAt: parsed.data.mileageLastSeen ? new Date() : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "CREATED",
        resourceType: "vehicle",
        resourceId: vehicle.id,
        metadata: { customerId: id },
      },
    });

    return successResponse({ vehicle }, 201);
  } catch (error) {
    console.error("POST vehicle:", error);
    return ApiErrors.internal();
  }
}
