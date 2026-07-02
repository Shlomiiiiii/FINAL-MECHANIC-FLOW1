import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users, Plus, Clock, Star, Wrench, TrendingUp,
  Shield, AlertTriangle, CheckCircle,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

const ROLE_COLORS: Record<string, string> = {
  OWNER:        "text-purple-600 bg-purple-50",
  MANAGER:      "text-blue-600 bg-blue-50",
  OFFICE_STAFF: "text-green-600 bg-green-50",
  TECHNICIAN:   "text-orange-600 bg-orange-50",
};

const SKILL_LABELS: Record<string, string> = {
  junior: "Junior", mid: "Mid-level", senior: "Senior", master: "Master Tech",
};

export default async function TeamPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // Technicians redirect to their own profile
  if (user.role === "TECHNICIAN") redirect(`/team/${user.id}`);

  const employees = await prisma.user.findMany({
    where: {
      organizationId:   user.organizationId,
      isActive:         true,
      employmentStatus: { not: "terminated" },
    },
    include: {
      employeeProfile:  { select: { profilePhotoUrl: true, aseCertifications: true } },
      certifications:   { where: { isActive: true, expiresAt: { lt: new Date(Date.now() + 90 * 86400000) } } },
      clockEntries:     { where: { status: "open" }, take: 1, orderBy: { clockedInAt: "desc" } },
      _count:           { select: { jobAssignments: true } },
    },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const totalActive   = employees.length;
  const clockedIn     = employees.filter(e => e.clockEntries.length > 0).length;
  const certExpiring  = employees.reduce((s, e) => s + e.certifications.length, 0);
  const masterTechs   = employees.filter(e => e.skillLevel === "master").length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Team"
        subtitle={`${totalActive} active · ${clockedIn} clocked in`}
        actions={
          ["OWNER","MANAGER"].includes(user.role) ? (
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/team/new"><Plus className="h-3.5 w-3.5" /> Add employee</Link>
            </Button>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active employees", value: String(totalActive), icon: Users, color: "text-primary", bg: "bg-primary/5" },
            { label: "Clocked in now",  value: String(clockedIn), icon: Clock, color: "text-green-600", bg: "bg-green-50" },
            { label: "Master techs",    value: String(masterTechs), icon: Wrench, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "Expiring certs",  value: String(certExpiring), icon: certExpiring > 0 ? AlertTriangle : Shield, color: certExpiring > 0 ? "text-amber-600" : "text-muted-foreground", bg: certExpiring > 0 ? "bg-amber-50" : "bg-muted" },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", k.bg)}>
                  <k.icon className={cn("h-3.5 w-3.5", k.color)} />
                </div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Team grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const isClockedIn  = emp.clockEntries.length > 0;
            const clockedInAt  = isClockedIn ? emp.clockEntries[0].clockedInAt : null;
            const minutesSince = clockedInAt
              ? Math.round((Date.now() - new Date(clockedInAt).getTime()) / 60000)
              : 0;
            const expiringCertCount = emp.certifications.length;

            return (
              <Link key={emp.id} href={`/team/${emp.id}`}
                className="bg-card border border-border rounded-xl p-5 hover:border-border-strong hover:shadow-sm transition-all group">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-12 w-12">
                      {emp.avatarUrl
                        ? <img src={emp.avatarUrl} alt={emp.fullName} className="h-12 w-12 rounded-full object-cover" />
                        : <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary"
                            style={emp.color ? { backgroundColor: emp.color + "20", color: emp.color } : {}}>
                            {getInitials(emp.fullName)}
                          </AvatarFallback>
                      }
                    </Avatar>
                    {isClockedIn && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-background" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{emp.fullName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{emp.position ?? emp.role.replace("_"," ").toLowerCase()}</p>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Badge variant="secondary" className={cn("text-[10px] py-0", ROLE_COLORS[emp.role])}>
                        {emp.role.replace("_"," ")}
                      </Badge>
                      {emp.skillLevel && (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {SKILL_LABELS[emp.skillLevel] ?? emp.skillLevel}
                        </Badge>
                      )}
                      {(emp.employeeProfile?.aseCertifications?.length ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-[10px] py-0 text-blue-700 bg-blue-50">
                          {emp.employeeProfile!.aseCertifications.length} ASE
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-border grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className={cn("h-3.5 w-3.5", isClockedIn ? "text-green-500" : "text-muted-foreground/50")} />
                    {isClockedIn
                      ? <span className="text-green-700">{Math.floor(minutesSince/60)}h {minutesSince%60}m in</span>
                      : "Not clocked in"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" />
                    {emp._count.jobAssignments} jobs
                  </div>
                  {expiringCertCount > 0 && (
                    <div className="flex items-center gap-1.5 col-span-2 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {expiringCertCount} cert{expiringCertCount > 1 ? "s" : ""} expiring soon
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {employees.length === 0 && (
          <div className="text-center py-16">
            <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No team members yet</p>
            <Button size="sm" className="mt-4" asChild>
              <Link href="/team/new">Add first employee</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
