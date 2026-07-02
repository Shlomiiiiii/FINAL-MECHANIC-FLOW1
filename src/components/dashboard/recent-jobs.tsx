import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatCents } from "@/lib/utils";
import type { JobStatus } from "@prisma/client";

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

interface RecentJob {
  id: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  totalCents: number;
  customer: { firstName: string; lastName: string };
  vehicle: { year: number | null; make: string | null; model: string | null } | null;
  assignments: { user: { fullName: string } }[];
}

interface DashboardRecentJobsProps {
  jobs: RecentJob[];
}

export function DashboardRecentJobs({ jobs }: DashboardRecentJobsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-4 px-5">
        <CardTitle className="text-sm font-semibold">Recent Jobs</CardTitle>
        <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
          <Link href="/jobs">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {jobs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No jobs yet.{" "}
            <Link href="/jobs/new" className="text-primary hover:underline">
              Create your first job →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => {
              const status = STATUS_CONFIG[job.status];
              const vehicleLabel = job.vehicle
                ? `${job.vehicle.year ?? ""} ${job.vehicle.make ?? ""} ${job.vehicle.model ?? ""}`.trim()
                : null;
              const techName = job.assignments[0]?.user.fullName ?? null;

              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono font-medium text-muted-foreground">
                        {job.jobNumber}
                      </span>
                      <Badge variant={status.variant} className="text-[10px] py-0">
                        {status.label}
                      </Badge>
                    </div>
                    <div className="text-sm font-medium text-foreground truncate">
                      {job.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {job.customer.firstName} {job.customer.lastName}
                      {vehicleLabel && ` · ${vehicleLabel}`}
                      {techName && ` · ${techName}`}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
                    {formatCents(job.totalCents)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
