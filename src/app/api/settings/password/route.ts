import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/auth/password";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword:     z.string().min(10, "Password must be at least 10 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const { currentPassword, newPassword } = parsed.data;

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return ApiErrors.validation({ newPassword: strength.errors });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!dbUser) return ApiErrors.notFound("User");

    const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return ApiErrors.validation({ currentPassword: ["Current password is incorrect"] });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // Invalidate all other sessions so devices are logged out
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    return successResponse({ success: true });
  } catch (err) {
    console.error("POST /api/settings/password:", err);
    return ApiErrors.internal();
  }
}
