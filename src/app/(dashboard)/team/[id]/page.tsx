import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  Edit, Mail, Phone, MapPin, Shield, Award, Clock,
  Wrench, TrendingUp, Calendar, FileText, Star,
  AlertTriangle, CheckCircle, User, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, select: { fullName: true } });
  return { title: u?.fullName ?? "Employee" };
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner", MANAGER: "Manager", TECHNICIAN: "Technician", OFFICE_STAFF: "Office Staff",
};
const SKILL_LABELS: Record<string, string> = {
  junior: "Junior Tech", mid: "Mid-Level Tech", senior: "Senior Tech", master: "Master Tech",
};
const CERT_TYPE_LABELS: Record<string, string> = {
  ase: "ASE", oem: "OEM", safety: "Safety", epa: "EPA",
  state_license: "State License", manufacturer: "Manufacturer", other: "Other",
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;

  // Technicians can only view themselves
  if (user.role === "TECHNICIAN" && id !== user.id) redirect("/dashboard");

  const employee = await prisma.user.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      employeeProfile:   true,
      certifications:    { orderBy: [{ isActive: "desc" }, { expiresAt: "asc" }] },
      clockEntries:      { orderBy: { clockedInAt: "desc" }, take: 14 },
      performanceReviews: {
        where: { userId: id },
        orderBy: { reviewDate: "desc" },
        take: 5,
        include: { reviewedBy: { select: { fullName: true } } },
      },
      availability:      { orderBy: { dayOfWeek: "asc" } },
      timeOff:           { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } },
    },
  });
  if (!employee) notFound();

  // Recent jobs
  const recentJobs = await prisma.jobAssignment.findMany({
    where: { userId: id, job: { organizationId: user.organizationId, deletedAt: null } },
    include: {
      job: {
        select: {
          id: true, jobNumber: true, title: true, status: true,
          totalCents: true, completedAt: true, customer: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Metrics
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const hoursThisMonth = await prisma.employeeClockEntry.aggregate({
    where: { userId: id, organizationId: user.organizationId, clockedInAt: { gte: monthStart }, status: { not: "open" } },
    _sum: { totalMinutes: true, overtimeMinutes: true },
  });

  const expiringSoon = employee.certifications.filter(c => {
    if (!c.expiresAt || !c.isActive) return false;
    return c.expiresAt < new Date(Date.now() + 90 * 86400000);
  });

  const p = employee.employeeProfile;
  const hoursThisMo = Math.round((hoursThisMonth._sum.totalMinutes ?? 0) / 60 * 10) / 10;
  const overtimeMo  = Math.round((hoursThisMonth._sum.overtimeMinutes ?? 0) / 60 * 10) / 10;

  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title={employee.fullName}
        subtitle={employee.position ?? ROLE_LABELS[employee.role]}
        actions={
          (["OWNER","MANAGER"].includes(user.role) || id === user.id) ? (
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <Link href={`/team/${id}/edit`}><Edit className="h-3.5 w-3.5" /> Edit</Link>
            </Button>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">

          {/* Header card */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-start gap-5 p-6 border-b border-border">
              <Avatar className="h-16 w-16 flex-shrink-0">
                {employee.avatarUrl
                  ? <img src={employee.avatarUrl} alt={employee.fullName} className="rounded-full object-cover" />
                  : <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                      {getInitials(employee.fullName)}
                    </AvatarFallback>
                }
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl font-semibold">{employee.fullName}</h1>
                  <Badge variant="secondary" className="text-xs">{ROLE_LABELS[employee.role]}</Badge>
                  {employee.skillLevel && (
                    <Badge variant="outline" className="text-xs">{SKILL_LABELS[employee.skillLevel]}</Badge>
                  )}
                  {!employee.isActive && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{employee.position}{employee.department && ` · ${employee.department}`}</p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  {employee.email && (
                    <a href={`mailto:${employee.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" />{employee.email}
                    </a>
                  )}
                  {employee.phone && (
                    <a href={`tel:${employee.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" />{employee.phone}
                    </a>
                  )}
                  {employee.hireDate && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      Hired {new Date(employee.hireDate).toLocaleDateString("en-US",{month:"long",year:"numeric"})}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 text-xs text-muted-foreground">
                {employee.employeeId && <p>ID: {employee.employeeId}</p>}
                {employee.hourlyRate && <p>${(employee.hourlyRate/100).toFixed(2)}/hr</p>}
              </div>
            </div>

            {/* Metrics strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
              {[
                { label: "Hours this month", value: `${hoursThisMo}h`, sub: overtimeMo > 0 ? `${overtimeMo}h OT` : undefined },
                { label: "Jobs this year", value: String(employee.jobsCompletedCount) },
                { label: "Avg rating", value: employee.avgJobRating ? `${Number(employee.avgJobRating).toFixed(1)}★` : "—" },
                { label: "Comeback rate", value: employee.comebackRate ? `${(Number(employee.comebackRate)*100).toFixed(1)}%` : "—" },
              ].map((m) => (
                <div key={m.label} className="px-4 py-3.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{m.value}</p>
                  {m.sub && <p className="text-[10px] text-amber-600">{m.sub}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Cert warning */}
          {expiringSoon.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800 font-medium">
                {expiringSoon.length} certification{expiringSoon.length > 1 ? "s" : ""} expiring within 90 days:&nbsp;
                {expiringSoon.map(c => c.name).join(", ")}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-card border border-border rounded-xl p-6">
            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start bg-transparent p-0 h-auto gap-0 border-b border-border rounded-none mb-6">
                {["overview","certifications","time","jobs","availability","reviews"].map(tab => (
                  <TabsTrigger key={tab} value={tab}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm capitalize">
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* OVERVIEW */}
              <TabsContent value="overview" className="space-y-5">
                {p && (
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact</p>
                      <div className="space-y-2 text-sm">
                        {p.personalPhone && <div className="flex gap-2"><Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />{p.personalPhone}</div>}
                        {p.addressLine1 && (
                          <div className="flex gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div>
                              <p>{p.addressLine1}</p>
                              {p.city && <p>{p.city}, {p.state} {p.zip}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Emergency contact</p>
                      <div className="space-y-1 text-sm">
                        {p.emergencyName && <p className="font-medium">{p.emergencyName} {p.emergencyRelation && <span className="text-muted-foreground font-normal">({p.emergencyRelation})</span>}</p>}
                        {p.emergencyPhone && <p className="text-muted-foreground">{p.emergencyPhone}</p>}
                      </div>
                    </div>
                  </div>
                )}
                {employee.specialties.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Specialties</p>
                    <div className="flex gap-2 flex-wrap">
                      {employee.specialties.map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium capitalize">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {p?.notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.notes}</p>
                  </div>
                )}
              </TabsContent>

              {/* CERTIFICATIONS */}
              <TabsContent value="certifications">
                <div className="space-y-3">
                  {employee.certifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No certifications on file.</p>
                  ) : employee.certifications.map(cert => {
                    const isExpired  = cert.expiresAt && cert.expiresAt < new Date();
                    const expireSoon = cert.expiresAt && cert.expiresAt < new Date(Date.now() + 90*86400000);
                    return (
                      <div key={cert.id} className={cn("rounded-lg border p-4 flex items-start justify-between gap-4",
                        isExpired ? "border-destructive/30 bg-destructive/5" :
                        expireSoon ? "border-amber-200 bg-amber-50" :
                        "border-border"
                      )}>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Award className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{cert.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {CERT_TYPE_LABELS[cert.certType] ?? cert.certType}
                              {cert.certNumber && ` · #${cert.certNumber}`}
                              {cert.issuingBody && ` · ${cert.issuingBody}`}
                            </p>
                            {cert.expiresAt && (
                              <p className={cn("text-xs mt-0.5",
                                isExpired ? "text-destructive font-medium" :
                                expireSoon ? "text-amber-600 font-medium" : "text-muted-foreground"
                              )}>
                                {isExpired ? "Expired" : "Expires"} {new Date(cert.expiresAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                              </p>
                            )}
                          </div>
                        </div>
                        {cert.isActive
                          ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          : <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              {/* TIME */}
              <TabsContent value="time">
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_100px_80px_80px_80px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Date</span><span>In</span><span>Out</span><span>Regular</span><span>OT</span>
                  </div>
                  {employee.clockEntries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No time entries.</div>
                  ) : employee.clockEntries.map(entry => (
                    <div key={entry.id} className="grid grid-cols-[1fr_100px_80px_80px_80px] gap-3 px-4 py-3 border-b border-border last:border-b-0 text-sm">
                      <span>{new Date(entry.clockedInAt).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
                      <span className="text-muted-foreground">{new Date(entry.clockedInAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</span>
                      <span className="text-muted-foreground">{entry.clockedOutAt ? new Date(entry.clockedOutAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}) : <span className="text-green-600">Active</span>}</span>
                      <span>{entry.regularMinutes > 0 ? `${Math.floor(entry.regularMinutes/60)}h${entry.regularMinutes%60>0?`${entry.regularMinutes%60}m`:""}` : "—"}</span>
                      <span className={entry.overtimeMinutes > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                        {entry.overtimeMinutes > 0 ? `${Math.floor(entry.overtimeMinutes/60)}h${entry.overtimeMinutes%60>0?`${entry.overtimeMinutes%60}m`:""}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* JOBS */}
              <TabsContent value="jobs">
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {recentJobs.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No jobs assigned.</div>
                  ) : recentJobs.map(ja => (
                    <Link key={ja.id} href={`/jobs/${ja.job.id}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ja.job.title}</p>
                        <p className="text-xs text-muted-foreground">{ja.job.jobNumber} · {ja.job.customer.firstName} {ja.job.customer.lastName}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">{ja.job.status.replace("_"," ")}</Badge>
                      <span className="text-sm font-semibold tabular-nums flex-shrink-0">${(ja.job.totalCents/100).toFixed(0)}</span>
                    </Link>
                  ))}
                </div>
              </TabsContent>

              {/* AVAILABILITY */}
              <TabsContent value="availability">
                <div className="grid grid-cols-7 gap-2">
                  {DAY_NAMES.map((day, i) => {
                    const avail = employee.availability.find(a => a.dayOfWeek === i);
                    return (
                      <div key={day} className={cn("rounded-lg border p-3 text-center",
                        avail?.isAvailable === false ? "bg-muted/40 border-dashed" : "border-border")}>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">{day}</p>
                        {avail ? (
                          avail.isAvailable
                            ? <><p className="text-xs">{avail.startTime ?? "8:00"}</p><p className="text-xs text-muted-foreground">–</p><p className="text-xs">{avail.endTime ?? "17:00"}</p></>
                            : <p className="text-xs text-muted-foreground">Off</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Default</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {employee.timeOff.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Upcoming time off</p>
                    <div className="space-y-2">
                      {employee.timeOff.map(t => (
                        <div key={t.id} className="flex items-center gap-3 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{t.title}</span>
                          <span className="text-muted-foreground">
                            {new Date(t.startsAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})} – {new Date(t.endsAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                          </span>
                          <Badge variant={t.approved ? "success" : "warning"} className="text-[10px] py-0">
                            {t.approved ? "Approved" : "Pending"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* REVIEWS */}
              <TabsContent value="reviews">
                {["OWNER","MANAGER"].includes(user.role) && (
                  <div className="mb-4 flex justify-end">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add review
                    </Button>
                  </div>
                )}
                {employee.performanceReviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No performance reviews yet.</p>
                ) : employee.performanceReviews.map(review => (
                  <div key={review.id} className="rounded-lg border border-border p-4 mb-3">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{review.reviewPeriod}</p>
                        <p className="text-xs text-muted-foreground">
                          By {review.reviewedBy.fullName} · {new Date(review.reviewDate).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
                        </p>
                      </div>
                      {review.overallScore && (
                        <div className="text-right">
                          <p className="text-2xl font-bold">{Number(review.overallScore).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">/ 5.0</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center text-xs mb-3">
                      {[
                        ["Technical", review.technicalScore],
                        ["Quality", review.qualityScore],
                        ["Efficiency", review.efficiencyScore],
                        ["Customer", review.customerScore],
                        ["Teamwork", review.teamworkScore],
                      ].map(([label, score]) => score && (
                        <div key={label as string} className="bg-muted/40 rounded p-2">
                          <p className="text-muted-foreground mb-1">{label}</p>
                          <p className="font-semibold text-base">{score}</p>
                        </div>
                      ))}
                    </div>
                    {review.strengths && <p className="text-xs text-muted-foreground mb-1"><strong>Strengths:</strong> {review.strengths}</p>}
                    {review.improvements && <p className="text-xs text-muted-foreground"><strong>Areas to improve:</strong> {review.improvements}</p>}
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
}
