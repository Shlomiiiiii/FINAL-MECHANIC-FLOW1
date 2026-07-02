import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { BUILTIN_TEMPLATES } from "@/lib/estimate-templates";

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();

    const orgTemplates = await prisma.estimateTemplate.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    });

    return successResponse({
      builtin: BUILTIN_TEMPLATES,
      custom: orgTemplates,
    });
  } catch (err) {
    console.error("GET /estimate-templates:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER", "MANAGER"].includes(user.role)) return ApiErrors.forbidden();

    const body = await request.json();
    const { name, description, category, lineItems, defaultTitle, defaultNotes, defaultWarranty } = body;

    if (!name || !lineItems) return ApiErrors.validation({ name: ["Name is required"], lineItems: ["Line items required"] });

    const template = await prisma.estimateTemplate.create({
      data: {
        organizationId: user.organizationId,
        name,
        description,
        category,
        lineItems,
        defaultTitle,
        defaultNotes,
        defaultWarranty,
        createdById: user.id,
      },
    });

    return successResponse({ template }, 201);
  } catch (err) {
    console.error("POST /estimate-templates:", err);
    return ApiErrors.internal();
  }
}
