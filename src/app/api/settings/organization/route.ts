import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const orgSchema = z.object({
  // Business info
  name:         z.string().min(1).max(200).optional(),
  phone:        z.string().max(30).optional(),
  email:        z.string().email().optional().or(z.literal("")),
  website:      z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city:         z.string().max(100).optional(),
  state:        z.string().max(50).optional(),
  zip:          z.string().max(20).optional(),
  country:      z.string().max(2).optional(),
  timezone:     z.string().max(60).optional(),
  currency:     z.string().max(3).optional(),
  logoUrl:      z.string().url().optional().or(z.literal("")),

  // Financial
  taxRatePct:                z.number().min(0).max(100).optional(),
  taxLabel:                  z.string().max(30).optional(),
  invoicePrefix:             z.string().max(10).optional(),
  laborRateCents:            z.number().int().min(0).optional(),
  defaultPaymentTermsDays:   z.number().int().min(0).max(365).optional(),
  invoiceNotes:              z.string().max(2000).optional(),
  invoiceTerms:              z.string().max(2000).optional(),

  // Notifications
  emailNotificationsEnabled: z.boolean().optional(),
  smsNotificationsEnabled:   z.boolean().optional(),
  onlinePaymentsEnabled:     z.boolean().optional(),

  // Customer portal
  customerPortalEnabled:   z.boolean().optional(),
  portalWelcomeMessage:    z.string().max(500).optional(),
  portalAllowBooking:      z.boolean().optional(),
  portalAllowChat:         z.boolean().optional(),
  portalAllowPhotoUpload:  z.boolean().optional(),
  portalRequireOtp:        z.boolean().optional(),
});

export async function GET(_req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true, name: true, slug: true, phone: true, email: true,
        website: true, addressLine1: true, addressLine2: true,
        city: true, state: true, zip: true, country: true,
        timezone: true, currency: true, logoUrl: true,
        taxRatePct: true, taxLabel: true, invoicePrefix: true,
        laborRateCents: true, defaultPaymentTermsDays: true,
        invoiceNotes: true, invoiceTerms: true,
        emailNotificationsEnabled: true, smsNotificationsEnabled: true,
        onlinePaymentsEnabled: true, customerPortalEnabled: true,
        portalWelcomeMessage: true, portalAllowBooking: true,
        portalAllowChat: true, portalAllowPhotoUpload: true,
        portalRequireOtp: true,
        plan: true, trialEndsAt: true, isActive: true,
        stripeAccountOnboarded: true,
      },
    });

    if (!org) return ApiErrors.notFound("Organization");
    return successResponse({ organization: org });
  } catch (err) {
    console.error("GET /api/settings/organization:", err);
    return ApiErrors.internal();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER", "MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const body = await request.json();
    const parsed = orgSchema.safeParse(body);

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

    // Only OWNER can change the org name
    if (data.name && user.role !== "OWNER") {
      return ApiErrors.forbidden();
    }

    const updated = await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...data,
        taxRatePct: data.taxRatePct !== undefined
          ? String(data.taxRatePct / 100) // store as 0.0825 for 8.25%
          : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "UPDATED",
        resourceType: "organization",
        resourceId: user.organizationId,
        metadata: { fields: Object.keys(data) } as any,
      },
    });

    return successResponse({ organization: updated });
  } catch (err) {
    console.error("PATCH /api/settings/organization:", err);
    return ApiErrors.internal();
  }
}
