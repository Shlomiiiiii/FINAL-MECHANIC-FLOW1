import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";
import { successResponse, ApiErrors } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const { email, password, organizationSlug } = parsed.data;

    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug, isActive: true },
    });

    if (!organization) {
      return ApiErrors.validation({
        organizationSlug: ["Workspace not found. Check the name and try again."],
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email: email.toLowerCase().trim(),
        },
      },
    });

    if (!user || !user.isActive) {
      await verifyPassword(password, "$2a$12$invalidhashfortimingsafety.00000000000000000000000000000");
      return ApiErrors.validation({
        email: ["Invalid email or password."],
        password: ["Invalid email or password."],
      });
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return ApiErrors.validation({
        email: ["Invalid email or password."],
        password: ["Invalid email or password."],
      });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const token = await createSession(user.id, organization.id, { ipAddress, userAgent });
    await setSessionCookie(token);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        organizationName: organization.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return ApiErrors.internal();
  }
}
