import type { JobStatus } from "@prisma/client";

export interface StatusConfig {
  label: string;
  shortLabel: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
  color: string; // hex for kanban column accents
  group: "open" | "active" | "blocked" | "done" | "closed";
  description: string;
}

export const JOB_STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  LEAD: { label: "Lead", shortLabel: "Lead", variant: "secondary", color: "#94a3b8", group: "open", description: "Potential work, not yet quoted" },
  ESTIMATE: { label: "Estimate", shortLabel: "Estimate", variant: "secondary", color: "#a78bfa", group: "open", description: "Estimate created, awaiting approval" },
  APPROVED: { label: "Approved", shortLabel: "Approved", variant: "info", color: "#60a5fa", group: "open", description: "Customer approved, ready to schedule" },
  SCHEDULED: { label: "Scheduled", shortLabel: "Scheduled", variant: "info", color: "#3b82f6", group: "open", description: "Appointment booked" },
  TECH_ASSIGNED: { label: "Tech Assigned", shortLabel: "Assigned", variant: "info", color: "#2563eb", group: "open", description: "Technician assigned to job" },
  TRAVELING: { label: "Traveling", shortLabel: "Traveling", variant: "warning", color: "#f59e0b", group: "active", description: "Tech en route to customer" },
  ON_SITE: { label: "On Site", shortLabel: "On Site", variant: "warning", color: "#f97316", group: "active", description: "Tech arrived at location" },
  IN_PROGRESS: { label: "In Progress", shortLabel: "Working", variant: "success", color: "#22c55e", group: "active", description: "Work actively underway" },
  WAITING_PARTS: { label: "Waiting on Parts", shortLabel: "Parts", variant: "warning", color: "#eab308", group: "blocked", description: "Blocked pending parts arrival" },
  PAUSED: { label: "Paused", shortLabel: "Paused", variant: "secondary", color: "#a8a29e", group: "blocked", description: "Work temporarily paused" },
  PENDING_REVIEW: { label: "Pending Review", shortLabel: "Review", variant: "warning", color: "#f59e0b", group: "active", description: "Work done, needs review" },
  COMPLETED: { label: "Completed", shortLabel: "Done", variant: "success", color: "#16a34a", group: "done", description: "Work finished" },
  INVOICED: { label: "Invoiced", shortLabel: "Invoiced", variant: "info", color: "#0ea5e9", group: "done", description: "Invoice generated" },
  CLOSED: { label: "Closed", shortLabel: "Closed", variant: "outline", color: "#64748b", group: "closed", description: "Paid and closed" },
  CANCELLED: { label: "Cancelled", shortLabel: "Cancelled", variant: "destructive", color: "#ef4444", group: "closed", description: "Job cancelled" },
  ARCHIVED: { label: "Archived", shortLabel: "Archived", variant: "outline", color: "#94a3b8", group: "closed", description: "Archived for records" },
};

// Columns shown on the kanban board (in order)
export const KANBAN_COLUMNS: JobStatus[] = [
  "LEAD",
  "ESTIMATE",
  "APPROVED",
  "SCHEDULED",
  "TECH_ASSIGNED",
  "TRAVELING",
  "ON_SITE",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "PAUSED",
  "PENDING_REVIEW",
  "COMPLETED",
  "INVOICED",
  "CLOSED",
];

// Allowed status transitions (state machine). Empty array = terminal.
export const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  LEAD: ["ESTIMATE", "APPROVED", "SCHEDULED", "CANCELLED"],
  ESTIMATE: ["APPROVED", "SCHEDULED", "CANCELLED", "LEAD"],
  APPROVED: ["SCHEDULED", "TECH_ASSIGNED", "CANCELLED"],
  SCHEDULED: ["TECH_ASSIGNED", "TRAVELING", "ON_SITE", "IN_PROGRESS", "CANCELLED", "APPROVED"],
  TECH_ASSIGNED: ["TRAVELING", "ON_SITE", "IN_PROGRESS", "CANCELLED", "SCHEDULED"],
  TRAVELING: ["ON_SITE", "IN_PROGRESS", "PAUSED", "CANCELLED"],
  ON_SITE: ["IN_PROGRESS", "WAITING_PARTS", "PAUSED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "PAUSED", "PENDING_REVIEW", "COMPLETED", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "PAUSED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "ON_SITE", "WAITING_PARTS", "CANCELLED"],
  PENDING_REVIEW: ["COMPLETED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["INVOICED", "CLOSED", "IN_PROGRESS"],
  INVOICED: ["CLOSED", "COMPLETED"],
  CLOSED: ["ARCHIVED", "INVOICED"],
  CANCELLED: ["ARCHIVED", "LEAD"],
  ARCHIVED: ["LEAD"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Which timestamp field to set when entering a status
export const STATUS_TIMESTAMP_FIELD: Partial<Record<JobStatus, string>> = {
  SCHEDULED: "scheduledAt",
  ON_SITE: "onSiteAt",
  IN_PROGRESS: "startedAt",
  PAUSED: "pausedAt",
  COMPLETED: "completedAt",
};
