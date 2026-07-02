import type { SessionUser } from "./index";

export interface LoginCredentials {
  email: string;
  password: string;
  organizationSlug: string;
}

export interface AuthSession {
  user: SessionUser;
  sessionId: string;
  expiresAt: Date;
}

export type RolePermissions = {
  canManageOrganization: boolean;
  canManageBilling: boolean;
  canManageUsers: boolean;
  canViewAllJobs: boolean;
  canCreateJobs: boolean;
  canDeleteJobs: boolean;
  canCreateEstimates: boolean;
  canSendEstimates: boolean;
  canCreateInvoices: boolean;
  canVoidInvoices: boolean;
  canRecordPayments: boolean;
  canIssueRefunds: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  canManageScheduling: boolean;
};
