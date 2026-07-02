import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Topbar } from "@/components/layout/topbar";
import { PlanBuilder } from "@/components/memberships/plan-builder";

export const metadata: Metadata = { title: "New Membership Plan" };

export default async function NewPlanPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["OWNER","MANAGER"].includes(user.role)) redirect("/memberships");
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar user={user} title="New membership plan" subtitle="Build a recurring service plan for your customers" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <PlanBuilder mode="create" />
        </div>
      </main>
    </div>
  );
}
