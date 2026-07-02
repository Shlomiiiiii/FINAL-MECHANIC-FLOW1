import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { registerOrganizationSchema } from "@/lib/validations/auth";
import { successResponse, ApiErrors } from "@/lib/api-response";

/** Reserved slugs that would collide with app routes or be confusing. */
const RESERVED_SLUGS = new Set([
  "api", "login", "register", "dashboard", "portal", "admin", "settings",
  "www", "app", "mail", "support", "help", "billing", "auth", "static",
  "assets", "public", "new", "edit", "logout", "forgot-password", "reset-password",
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerOrganizationSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const { organizationName, slug, ownerFullName, ownerEmail, ownerPassword } = parsed.data;
    const normalizedSlug  = slug.toLowerCase().trim();
    const normalizedEmail = ownerEmail.toLowerCase().trim();

    // Reserved slug check
    if (RESERVED_SLUGS.has(normalizedSlug)) {
      return ApiErrors.validation({
        slug: ["That workspace name is reserved. Please choose another."],
      });
    }

    // Enforce password strength (matches the rules surfaced in the UI)
    const strength = validatePasswordStrength(ownerPassword);
    if (!strength.valid) {
      return ApiErrors.validation({ ownerPassword: strength.errors });
    }

    // Slug uniqueness
    const slugTaken = await prisma.organization.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });
    if (slugTaken) {
      return ApiErrors.validation({
        slug: ["That workspace name is already taken. Try another."],
      });
    }

    const passwordHash = await hashPassword(ownerPassword);

    // 14-day free trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // Create organization + owner atomically
    const { organization, user } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name:        organizationName.trim(),
          slug:        normalizedSlug,
          plan:        "STARTER",
          trialEndsAt,
          email:       normalizedEmail,
          isActive:    true,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId:  organization.id,
          email:           normalizedEmail,
          fullName:        ownerFullName.trim(),
          passwordHash,
          role:            "OWNER",
          employmentStatus: "full_time",
          isActive:        true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId:         user.id,
          action:         "CREATED",
          resourceType:   "organization",
          resourceId:     organization.id,
          metadata:       { organizationName: organization.name, slug: organization.slug } as any,
        },
      });

      return { organization, user };
    });

    // Log the new owner straight in
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const token = await createSession(user.id, organization.id, { ipAddress, userAgent });
    await setSessionCookie(token);

    return successResponse(
      {
        user: {
          id:               user.id,
          email:            user.email,
          fullName:         user.fullName,
          role:             user.role,
          organizationId:   organization.id,
          organizationSlug: organization.slug,
          organizationName: organization.name,
        },
      },
      201
    );
  } catch (error: any) {
    // Unique-constraint race fallback (slug created between check and insert)
    if (error?.code === "P2002") {
      return ApiErrors.validation({
        slug: ["That workspace name is already taken. Try another."],
      });
    }
    console.error("Registration error:", error);
    return ApiErrors.internal();
  }
}
