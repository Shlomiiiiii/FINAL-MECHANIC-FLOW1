import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, logPortalAction } from "@/lib/portal/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? undefined;
  const session = await getPortalSession(slug);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const messages = await prisma.portalMessage.findMany({
    where: { customerId: session.customerId, organizationId: session.organizationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  // Mark unread staff messages as read
  await prisma.portalMessage.updateMany({
    where: {
      customerId:     session.customerId,
      organizationId: session.organizationId,
      senderType:     "staff",
      isRead:         false,
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ messages });
}

const msgSchema = z.object({
  slug:    z.string(),
  body:    z.string().min(1).max(5000),
  jobId:   z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json();
    const parsed = msgSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

    const session = await getPortalSession(parsed.data.slug);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { portalAllowChat: true },
    });
    if (!org?.portalAllowChat) {
      return NextResponse.json({ error: "Chat not enabled" }, { status: 403 });
    }

    const message = await prisma.portalMessage.create({
      data: {
        organizationId: session.organizationId,
        customerId:     session.customerId,
        senderType:     "customer",
        senderId:       session.customerId,
        body:           parsed.data.body,
        jobId:          parsed.data.jobId,
      },
    });

    await logPortalAction({ ...session, action: "send_message", resourceId: message.id });
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("POST /api/portal/messages:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
