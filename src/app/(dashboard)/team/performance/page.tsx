import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Topbar } from "@/components/layout/topbar";
import { TeamPerformanceClient } from "@/components/team/performance-client";

export const metadata: Metadata = { title: "Team Performance" };

export default async function TeamPerformancePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["OWNER","MANAGER"].includes(user.role)) redirect("/dashboard");
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="Team Performance" subtitle="Month-to-date metrics" />
      <main className="flex-1 overflow-y-auto p-6">
        <TeamPerformanceClient />
      </main>
    </div>
  );
}
