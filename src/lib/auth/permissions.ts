import type { UserRole } from "@prisma/client";
import type { RolePermissions } from "@/types/auth";

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  OWNER: {
    canManageOrganization: true,
    canManageBilling: true,
    canManageUsers: true,
    canViewAllJobs: true,
    canCreateJobs: true,
    canDeleteJobs: true,
    canCreateEstimates: true,
    canSendEstimates: true,
    canCreateInvoices: true,
    canVoidInvoices: true,
    canRecordPayments: true,
    canIssueRefunds: true,
    canManageInventory: true,
    canViewReports: true,
    canExportData: true,
    canManageScheduling: true,
  },
  MANAGER: {
    canManageOrganization: false,
    canManageBilling: false,
    canManageUsers: true,
    canViewAllJobs: true,
    canCreateJobs: true,
    canDeleteJobs: true,
    canCreateEstimates: true,
    canSendEstimates: true,
    canCreateInvoices: true,
    canVoidInvoices: true,
    canRecordPayments: true,
    canIssueRefunds: true,
    canManageInventory: true,
    canViewReports: true,
    canExportData: true,
    canManageScheduling: true,
  },
  OFFICE_STAFF: {
    canManageOrganization: false,
    canManageBilling: false,
    canManageUsers: false,
    canViewAllJobs: true,
    canCreateJobs: true,
    canDeleteJobs: false,
    canCreateEstimates: true,
    canSendEstimates: true,
    canCreateInvoices: true,
    canVoidInvoices: false,
    canRecordPayments: true,
    canIssueRefunds: false,
    canManageInventory: true,
    canViewReports: true,
    canExportData: false,
    canManageScheduling: true,
  },
  TECHNICIAN: {
    canManageOrganization: false,
    canManageBilling: false,
    canManageUsers: false,
    canViewAllJobs: false, // only assigned jobs
    canCreateJobs: false,
    canDeleteJobs: false,
    canCreateEstimates: false,
    canSendEstimates: false,
    canCreateInvoices: false,
    canVoidInvoices: false,
    canRecordPayments: false,
    canIssueRefunds: false,
    canManageInventory: true, // own usage only
    canViewReports: false,
    canExportData: false,
    canManageScheduling: false,
  },
};

export function getPermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: UserRole,
  permission: keyof RolePermissions
): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

export function requirePermission(
  role: UserRole,
  permission: keyof RolePermissions
): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Insufficient permissions: ${permission} required`);
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  TECHNICIAN: "Technician",
  OFFICE_STAFF: "Office Staff",
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER: 4,
  MANAGER: 3,
  OFFICE_STAFF: 2,
  TECHNICIAN: 1,
};

export function isRoleAtLeast(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}
