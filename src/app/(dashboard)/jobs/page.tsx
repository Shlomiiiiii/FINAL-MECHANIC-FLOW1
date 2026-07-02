import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { formatCents, formatDate } from "@/lib/utils";
import type { JobStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Jobs" };

const STATUS_CONFIG: Record<JobStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "success" },
  PENDING_REVIEW: { label: "Review", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  INVOICED: { label: "Invoiced", variant: "info" },
  CLOSED: { label: "Closed", variant: "outline" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

async function getJobs(organizationId: string, userRole: string, userId: string) {
  const where = {
    organizationId,
    deletedAt: null as null,
    ...(userRole === "TECHNICIAN" ? { assignments: { some: { userId } } } : {}),
  };

  return prisma.job.findMany({
    where,
    include: {
      customer: { select: { firstName: true, lastName: true } },
      vehicle: { select: { year: true, make: true, model: true } },
      assignments: {
        where: { isLead: true },
        include: { user: { select: { fullName: true } } },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export default async function JobsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const jobs = await getJobs(user.organizationId, user.role, user.id);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        user={user}
        title="Jobs"
        subtitle={`${jobs.length} total`}
        actions={
          user.role !== "TECHNICIAN" ? (
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/jobs/new">
                <Plus className="h-3.5 w-3.5" />
                New job
              </Link>
            </Button>
          ) : undefined
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <h3 className="text-sm font-semibold mb-1">No jobs yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first job to get started.</p>
            {user.role !== "TECHNICIAN" && (
              <Button size="sm" asChild><Link href="/jobs/new">New job</Link></Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-[100px_1fr_160px_120px_100px_100px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job #</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Total</span>
            </div>
            <div className="divide-y divide-border">
              {jobs.map((job) => {
                const status = STATUS_CONFIG[job.status];
                const leadTech = job.assignments[0]?.user.fullName;
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="grid grid-cols-[100px_1fr_160px_120px_100px_100px] gap-4 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors"
                  >
                    <span className="text-xs font-mono font-medium text-muted-foreground">{job.jobNumber}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{job.title}</div>
                      {job.vehicle && (
                        <div className="text-xs text-muted-foreground truncate">
                          {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground truncate">
                      {job.customer.firstName} {job.customer.lastName}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {leadTech ?? <span className="text-muted-foreground/50">Unassigned</span>}
                    </span>
                    <Badge variant={status.variant} className="text-xs w-fit">{status.label}</Badge>
                    <span className="text-sm font-semibold text-foreground text-right tabular-nums">
                      {formatCents(job.totalCents)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
