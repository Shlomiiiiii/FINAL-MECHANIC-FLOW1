import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { isGoogleMapsEnabled } from "@/lib/dispatch";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // Technicians land on a simplified mobile view
  if (user.role === "TECHNICIAN") redirect("/dispatch/mobile");

  if (!["OWNER","MANAGER","OFFICE_STAFF"].includes(user.role)) {
    redirect("/dashboard");
  }

  const [activeCount, unassignedCount, emergencyCount, onlineCount] = await Promise.all([
    prisma.job.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: ["TECH_ASSIGNED","TRAVELING","ON_SITE","IN_PROGRESS"] },
      },
    }),
    prisma.job.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: ["APPROVED","SCHEDULED","TECH_ASSIGNED"] },
        assignments: { none: {} },
      },
    }),
    prisma.job.count({
      where: { organizationId: user.organizationId, deletedAt: null, isEmergency: true, status: { notIn: ["COMPLETED","CLOSED","CANCELLED","ARCHIVED"] } },
    }),
    prisma.user.count({
      where: { organizationId: user.organizationId, isActive: true, dispatchStatus: { not: "offline" } },
    }),
  ]);

  const mapsEnabled = isGoogleMapsEnabled();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Dispatch"
        subtitle={`${onlineCount} online · ${activeCount} active jobs · ${unassignedCount} unassigned${emergencyCount > 0 ? ` · 🚨 ${emergencyCount} emergency` : ""}`}
      />

      {!mapsEnabled && (
        <div className="flex-shrink-0 bg-blue-600 text-white text-xs px-4 py-2 flex items-center gap-2">
          <span>💡 <strong>Tip:</strong> Add <code className="bg-blue-700 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> + <code className="bg-blue-700 px-1 rounded">GOOGLE_MAPS_SERVER_API_KEY</code> to unlock live maps, traffic routing &amp; accurate ETAs.</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <DispatchBoard userRole={user.role} />
      </div>
    </div>
  );
}
