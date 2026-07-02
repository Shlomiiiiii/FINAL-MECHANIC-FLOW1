import { z } from "zod";

const ALL_STATUSES = [
  "LEAD", "ESTIMATE", "APPROVED", "SCHEDULED", "TECH_ASSIGNED",
  "TRAVELING", "ON_SITE", "IN_PROGRESS", "WAITING_PARTS", "PAUSED",
  "PENDING_REVIEW", "COMPLETED", "INVOICED", "CLOSED", "CANCELLED", "ARCHIVED",
] as const;

export const jobSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleId: z.string().optional().or(z.literal("")),
  title: z.string().min(1, "Job title is required").max(200),
  description: z.string().max(5000).optional(),
  jobType: z.enum(["STANDARD", "WARRANTY", "ESTIMATE_ONLY", "INSPECTION"]).default("STANDARD"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  status: z.enum(ALL_STATUSES).optional(),
  internalNotes: z.string().max(5000).optional(),
  customerNotes: z.string().max(5000).optional(),
  mileageIn: z.number().int().min(0).optional(),
  assignedUserIds: z.array(z.string()).optional(),
  scheduledAt: z.string().optional(),
});

export const jobUpdateSchema = jobSchema.partial();

export const jobStatusSchema = z.object({
  status: z.enum(ALL_STATUSES),
  note: z.string().max(500).optional(),
  cancelReason: z.string().max(500).optional(),
});

export const lineItemSchema = z.object({
  itemType: z.enum(["LABOR", "PART", "FEE", "DISCOUNT"]),
  inventoryItemId: z.string().optional(),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().min(0.01).max(99999),
  unitCostCents: z.number().int().optional(),
  unitPriceCents: z.number().int(),
  taxable: z.boolean().optional().default(true),
  // Parts
  supplier: z.string().max(200).optional(),
  markupPct: z.number().min(0).max(1000).optional(),
  isBackordered: z.boolean().optional().default(false),
  backorderEta: z.string().optional(),
  // Labor
  technicianId: z.string().optional(),
  laborHours: z.number().min(0).max(999).optional(),
});

export const timeEntrySchema = z.object({
  type: z.enum(["LABOR", "TRAVEL", "BREAK"]).default("LABOR"),
  isBillable: z.boolean().optional().default(true),
  notes: z.string().max(500).optional(),
});

export const photoSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  category: z.enum(["BEFORE", "PROGRESS", "AFTER", "DAMAGE", "DOCUMENT", "OTHER"]).default("OTHER"),
  caption: z.string().max(500).optional(),
  isVideo: z.boolean().optional().default(false),
  fileSizeBytes: z.number().int().optional(),
  mimeType: z.string().optional(),
});

export const checklistSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().optional(),
  items: z.array(z.object({
    label: z.string().min(1).max(300),
    isRequired: z.boolean().optional().default(false),
    sortOrder: z.number().int().optional(),
  })).optional(),
});

export const checklistItemUpdateSchema = z.object({
  itemId: z.string(),
  status: z.enum(["PENDING", "PASS", "FAIL", "NA"]).optional(),
  notes: z.string().max(500).optional(),
  value: z.string().max(100).optional(),
});

export const signatureSchema = z.object({
  signatureData: z.string().min(1),
  signedByName: z.string().min(1, "Name is required").max(200),
  notes: z.string().max(500).optional(),
});

export type JobInput = z.infer<typeof jobSchema>;
export type JobStatusInput = z.infer<typeof jobStatusSchema>;
export type LineItemInput = z.infer<typeof lineItemSchema>;
export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
export type ChecklistInput = z.infer<typeof checklistSchema>;
export type SignatureInput = z.infer<typeof signatureSchema>;
