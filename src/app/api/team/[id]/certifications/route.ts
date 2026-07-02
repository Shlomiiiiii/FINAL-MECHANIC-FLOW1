import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const certSchema = z.object({
  certType:    z.enum(["ase","oem","safety","epa","state_license","manufacturer","other"]),
  name:        z.string().min(1).max(200),
  certNumber:  z.string().optional(),
  issuingBody: z.string().optional(),
  issuedAt:    z.string().optional(),
  expiresAt:   z.string().optional(),
  documentUrl: z.string().url().optional(),
  notes:       z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;
    if (user.role === "TECHNICIAN" && id !== user.id) return ApiErrors.forbidden();

    const certs = await prisma.employeeCertification.findMany({
      where: { userId: id, organizationId: user.organizationId },
      orderBy: [{ isActive: "desc" }, { expiresAt: "asc" }],
    });
    return successResponse({ certifications: certs });
  } catch (err) {
    console.error("GET certifications:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;
    // Managers/owners can add certs for anyone; technicians only for themselves
    if (!["OWNER","MANAGER"].includes(user.role) && id !== user.id) {
      return ApiErrors.forbidden();
    }

    const body   = await request.json();
    const parsed = certSchema.safeParse(body);
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
    const cert = await prisma.employeeCertification.create({
      data: {
        organizationId: user.organizationId,
        userId:         id,
        certType:       data.certType,
        name:           data.name,
        certNumber:     data.certNumber,
        issuingBody:    data.issuingBody,
        issuedAt:       data.issuedAt  ? new Date(data.issuedAt)  : undefined,
        expiresAt:      data.expiresAt ? new Date(data.expiresAt) : undefined,
        documentUrl:    data.documentUrl,
        notes:          data.notes,
      },
    });
    return successResponse({ certification: cert }, 201);
  } catch (err) {
    console.error("POST certifications:", err);
    return ApiErrors.internal();
  }
}
