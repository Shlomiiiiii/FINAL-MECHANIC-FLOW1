import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const photoSchema = z.object({
  slug:         z.string(),
  url:          z.string().url(),
  fileName:     z.string().max(200),
  fileSizeBytes: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB max
  mimeType:     z.string(),
  vehicleId:    z.string().optional(),
  jobId:        z.string().optional(),
  caption:      z.string().max(500).optional(),
  category:     z.enum(["damage","issue","before","after","receipt","other"]).optional(),
});

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const photos = await prisma.portalPhotoUpload.findMany({
    where: { customerId: session.customerId, organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ photos });
}

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = photoSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    const session = await getPortalSession(parsed.data.slug);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { portalAllowPhotoUpload: true },
    });
    if (!org?.portalAllowPhotoUpload) {
      return NextResponse.json({ error: "Photo uploads not enabled" }, { status: 403 });
    }

    const photo = await prisma.portalPhotoUpload.create({
      data: {
        organizationId: session.organizationId,
        customerId:     session.customerId,
        url:            parsed.data.url,
        fileName:       parsed.data.fileName,
        fileSizeBytes:  parsed.data.fileSizeBytes,
        mimeType:       parsed.data.mimeType,
        vehicleId:      parsed.data.vehicleId,
        jobId:          parsed.data.jobId,
        caption:        parsed.data.caption,
        category:       parsed.data.category,
      },
    });

    await logPortalAction({
      ...session, action: "upload_photo",
      resourceId: photo.id, metadata: { fileName: parsed.data.fileName, category: parsed.data.category },
    });

    return NextResponse.json({ photo }, { status: 201 });
  } catch (err) {
    console.error("POST /api/portal/photos:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
