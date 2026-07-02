import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const profileSchema = z.object({
  fullName:                z.string().min(1).max(200).optional(),
  phone:                   z.string().max(30).optional(),
  avatarUrl:               z.string().url().optional().or(z.literal("")),
  color:                   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notifyJobAssigned:       z.boolean().optional(),
  notifyEstimateApproved:  z.boolean().optional(),
  notifyInvoicePaid:       z.boolean().optional(),
  notifySmsEnabled:        z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body = await request.json();
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed.data,
      select: {
        id: true, fullName: true, email: true, phone: true,
        avatarUrl: true, color: true, role: true,
        notifyJobAssigned: true, notifyEstimateApproved: true,
        notifyInvoicePaid: true, notifySmsEnabled: true,
      },
    });

    return successResponse({ user: updated });
  } catch (err) {
    console.error("PATCH /api/settings/profile:", err);
    return ApiErrors.internal();
  }
}
