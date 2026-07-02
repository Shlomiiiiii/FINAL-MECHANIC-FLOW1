import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [upcoming, past] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        customerId:     session.customerId,
        organizationId: session.organizationId,
        startsAt:       { gte: new Date() },
        status:         { notIn: ["CANCELLED","NO_SHOW"] },
      },
      include: {
        vehicle:    { select: { year: true, make: true, model: true } },
        technician: { select: { fullName: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
    prisma.appointment.findMany({
      where: {
        customerId:     session.customerId,
        organizationId: session.organizationId,
        startsAt:       { lt: new Date() },
      },
      orderBy: { startsAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({ upcoming, past });
}

const bookSchema = z.object({
  slug:            z.string(),
  vehicleId:       z.string().optional(),
  title:           z.string().min(1).max(200),
  description:     z.string().max(1000).optional(),
  requestedDate:   z.string(), // ISO datetime
  locationType:    z.enum(["shop","mobile"]).default("shop"),
  locationAddress: z.string().optional(),
  notes:           z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const session = await getPortalSession(parsed.data.slug);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify portal allows booking
    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { portalAllowBooking: true },
    });
    if (!org?.portalAllowBooking) {
      return NextResponse.json({ error: "Online booking is not enabled for this location." }, { status: 403 });
    }

    const data     = parsed.data;
    const startsAt = new Date(data.requestedDate);
    const endsAt   = new Date(startsAt.getTime() + 60 * 60 * 1000); // 1h default

    // Get org owner as creator
    const owner = await prisma.user.findFirst({
      where: { organizationId: session.organizationId, role: "OWNER" },
      select: { id: true },
    });

    const appointment = await prisma.appointment.create({
      data: {
        organizationId:  session.organizationId,
        customerId:      session.customerId,
        vehicleId:       data.vehicleId,
        title:           data.title,
        description:     data.description,
        appointmentType: "service",
        status:          "SCHEDULED",
        priority:        "normal",
        startsAt,
        endsAt,
        locationType:    data.locationType,
        locationAddress: data.locationAddress,
        notes:           data.notes,
        createdById:     owner?.id ?? session.customerId,
      },
    });

    await logPortalAction({
      ...session, action: "book_appointment",
      resourceType: "appointment", resourceId: appointment.id,
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    console.error("POST /api/portal/appointments:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
