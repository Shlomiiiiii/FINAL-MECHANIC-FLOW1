import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { CalendarClient } from "@/components/calendar/calendar-client";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // Load all active users for technician filter + assignment
  const technicians = await prisma.user.findMany({
    where: { organizationId: user.organizationId, isActive: true },
    select: { id: true, fullName: true, color: true, role: true },
    orderBy: { fullName: "asc" },
  });

  // Dashboard stats for today
  const today = new Date();
  const todayStart = new Date(today); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(today); todayEnd.setHours(23,59,59,999);

  const [todayCount, unassignedCount, upcomingCount] = await Promise.all([
    prisma.appointment.count({
      where: {
        organizationId: user.organizationId,
        startsAt: { gte: todayStart, lte: todayEnd },
        status: { notIn: ["CANCELLED","NO_SHOW"] },
      },
    }),
    prisma.appointment.count({
      where: {
        organizationId: user.organizationId,
        technicianId: null,
        status: "SCHEDULED",
        startsAt: { gte: new Date() },
      },
    }),
    prisma.appointment.count({
      where: {
        organizationId: user.organizationId,
        startsAt: { gt: todayEnd },
        status: { in: ["SCHEDULED","CONFIRMED"] },
      },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Calendar"
        subtitle={`${todayCount} today · ${unassignedCount > 0 ? `${unassignedCount} unassigned · ` : ""}${upcomingCount} upcoming`}
      />

      {/* Stats strip */}
      {unassignedCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
          <span className="text-amber-600 text-sm font-medium">
            ⚠️ {unassignedCount} unassigned appointment{unassignedCount > 1 ? "s" : ""} need a technician
          </span>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <CalendarClient
          technicians={technicians}
          userRole={user.role}
          userId={user.id}
        />
      </div>
    </div>
  );
}
