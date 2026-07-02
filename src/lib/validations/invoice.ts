import { z } from "zod";

const ALL_STATUSES = [
  "DRAFT","SENT","VIEWED","PARTIALLY_PAID","PAID",
  "OVERDUE","CANCELLED","REFUNDED","ARCHIVED",
] as const;

const LINE_ITEM = z.object({
  id: z.string().optional(),
  itemType: z.enum(["LABOR","PART","FEE","DISCOUNT"]),
  description: z.string().min(1,"Description is required").max(500),
  quantity: z.number().min(0.01).max(99999),
  unitCostCents: z.number().int().optional().default(0),
  unitPriceCents: z.number().int(),
  taxable: z.boolean().optional().default(true),
  category: z.string().max(100).optional(),
  warranty: z.string().max(300).optional(),
  laborHours: z.number().min(0).optional(),
  technicianId: z.string().optional(),
  jobLineItemId: z.string().optional(),
  estimateLineItemId: z.string().optional(),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().min(1,"Customer is required"),
  vehicleId: z.string().optional(),
  jobId: z.string().optional(),
  estimateId: z.string().optional(),
  invoiceType: z.enum(["STANDARD","DEPOSIT","PARTIAL","RECURRING","WARRANTY","CREDIT_MEMO"]).default("STANDARD"),
  notes: z.string().max(5000).optional(),
  terms: z.string().max(2000).optional(),
  warrantyText: z.string().max(1000).optional(),
  poNumber: z.string().max(100).optional(),
  dueDate: z.string().optional(),
  depositCents: z.number().int().min(0).optional().default(0),
  lineItems: z.array(LINE_ITEM).min(1,"At least one line item is required"),
  // Recurring
  isRecurring: z.boolean().optional().default(false),
  recurringInterval: z.enum(["WEEKLY","MONTHLY","QUARTERLY","ANNUALLY"]).optional(),
  recurringEndDate: z.string().optional(),
});

export const updateInvoiceSchema = z.object({
  notes: z.string().max(5000).optional(),
  terms: z.string().max(2000).optional(),
  warrantyText: z.string().max(1000).optional(),
  poNumber: z.string().max(100).optional(),
  dueDate: z.string().nullable().optional(),
  depositCents: z.number().int().min(0).optional(),
  lineItems: z.array(LINE_ITEM).optional(),
});

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().min(1,"Amount must be greater than 0"),
  method: z.enum(["CARD","ACH","CARD_PRESENT","CASH","CHECK","OTHER"]),
  notes: z.string().max(500).optional(),
  stripePaymentIntentId: z.string().optional(),
  processedAt: z.string().optional(),
});

export const refundSchema = z.object({
  amountCents: z.number().int().min(1,"Refund amount must be greater than 0"),
  reason: z.string().max(500).optional(),
  stripeRefundId: z.string().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
