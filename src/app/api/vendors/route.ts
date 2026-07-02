import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const vendorSchema = z.object({
  name:         z.string().min(1).max(200),
  contactName:  z.string().max(200).optional(),
  email:        z.string().email().optional().or(z.literal("")),
  phone:        z.string().max(30).optional(),
  website:      z.string().max(200).optional(),
  accountNumber:z.string().max(100).optional(),
  paymentTerms: z.string().max(50).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  rating:       z.number().int().min(1).max(5).optional(),
  isPreferred:  z.boolean().optional().default(false),
  addressLine1: z.string().max(200).optional(),
  city:         z.string().max(100).optional(),
  state:        z.string().max(50).optional(),
  zip:          z.string().max(20).optional(),
  notes:        z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const where: any = { organizationId: user.organizationId, isActive: true };
    if (search) where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
    ];
    const vendors = await prisma.vendor.findMany({
      where,
      include: { _count: { select: { inventoryItems: true, purchaseOrders: true } } },
      orderBy: [{ isPreferred: "desc" }, { name: "asc" }],
    });
    return successResponse({ vendors });
  } catch (err) { return ApiErrors.internal(); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const body = await request.json();
    const parsed = vendorSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }
    const vendor = await prisma.vendor.create({
      data: { organizationId: user.organizationId, ...parsed.data, email: parsed.data.email || undefined },
    });
    return successResponse({ vendor }, 201);
  } catch (err) { return ApiErrors.internal(); }
}
