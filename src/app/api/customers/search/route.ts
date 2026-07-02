import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length < 1) return successResponse({ results: [] });

    // Search across customers AND their vehicles (VIN, plate)
    const [customers, vehicleMatches] = await Promise.all([
      prisma.customer.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phonePrimary: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { addressLine1: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phonePrimary: true,
          companyName: true,
          vehicles: {
            where: { deletedAt: null },
            select: { year: true, make: true, model: true },
            take: 1,
          },
        },
        take: 8,
      }),
      prisma.vehicle.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          OR: [
            { vin: { contains: q, mode: "insensitive" } },
            { licensePlate: { contains: q, mode: "insensitive" } },
            { make: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          vin: true,
          licensePlate: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phonePrimary: true,
            },
          },
        },
        take: 5,
      }),
    ]);

    // Also search job/invoice/estimate numbers
    const [jobMatch, invoiceMatch, estimateMatch] = await Promise.all([
      prisma.job.findFirst({
        where: { organizationId: user.organizationId, jobNumber: { contains: q, mode: "insensitive" }, deletedAt: null },
        select: { id: true, jobNumber: true, title: true, customerId: true, customer: { select: { firstName: true, lastName: true } } },
      }),
      prisma.invoice.findFirst({
        where: { organizationId: user.organizationId, invoiceNumber: { contains: q, mode: "insensitive" } },
        select: { id: true, invoiceNumber: true, customerId: true, customer: { select: { firstName: true, lastName: true } } },
      }),
      prisma.estimate.findFirst({
        where: { organizationId: user.organizationId, estimateNumber: { contains: q, mode: "insensitive" } },
        select: { id: true, estimateNumber: true, customerId: true, customer: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const results = [
      ...customers.map((c) => ({
        type: "customer" as const,
        id: c.id,
        customerId: c.id,
        label: `${c.firstName} ${c.lastName}`,
        sublabel: c.companyName ?? c.phonePrimary ?? c.email ?? "",
        vehicle: c.vehicles[0] ? `${c.vehicles[0].year} ${c.vehicles[0].make} ${c.vehicles[0].model}` : null,
      })),
      ...vehicleMatches.map((v) => ({
        type: "vehicle" as const,
        id: v.id,
        customerId: v.customer.id,
        label: `${v.year} ${v.make} ${v.model}`,
        sublabel: v.vin ?? v.licensePlate ?? `${v.customer.firstName} ${v.customer.lastName}`,
        vehicle: null,
      })),
      ...(jobMatch
        ? [{
            type: "job" as const,
            id: jobMatch.id,
            customerId: jobMatch.customerId,
            label: `${jobMatch.jobNumber} — ${jobMatch.title}`,
            sublabel: `${jobMatch.customer.firstName} ${jobMatch.customer.lastName}`,
            vehicle: null,
          }]
        : []),
      ...(invoiceMatch
        ? [{
            type: "invoice" as const,
            id: invoiceMatch.id,
            customerId: invoiceMatch.customerId,
            label: invoiceMatch.invoiceNumber,
            sublabel: `${invoiceMatch.customer.firstName} ${invoiceMatch.customer.lastName}`,
            vehicle: null,
          }]
        : []),
      ...(estimateMatch
        ? [{
            type: "estimate" as const,
            id: estimateMatch.id,
            customerId: estimateMatch.customerId,
            label: estimateMatch.estimateNumber,
            sublabel: `${estimateMatch.customer.firstName} ${estimateMatch.customer.lastName}`,
            vehicle: null,
          }]
        : []),
    ];

    return successResponse({ results: results.slice(0, 12) });
  } catch (error) {
    console.error("search:", error);
    return ApiErrors.internal();
  }
}
