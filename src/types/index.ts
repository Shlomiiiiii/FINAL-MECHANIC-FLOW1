import type { UserRole, JobStatus, EstimateStatus, InvoiceStatus, Plan } from "@prisma/client";

export type { UserRole, JobStatus, EstimateStatus, InvoiceStatus, Plan };

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  plan: Plan;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}

export interface DashboardMetrics {
  revenueToday: number;
  openJobs: number;
  pendingEstimates: number;
  overdueInvoicesTotal: number;
  overdueInvoicesCount: number;
}
