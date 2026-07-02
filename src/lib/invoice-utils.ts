/**
 * Shared invoice business logic.
 * Used by both API routes and server components.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface LineItemInput {
  itemType: "LABOR" | "PART" | "FEE" | "DISCOUNT";
  description: string;
  quantity: number;
  unitCostCents?: number;
  unitPriceCents: number;
  taxable?: boolean;
  category?: string;
  warranty?: string;
  laborHours?: number;
  technicianId?: string;
  jobLineItemId?: string;
  estimateLineItemId?: string;
}

export interface FinancialTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  balanceCents: number;
}

/**
 * Compute invoice totals from line items + org tax rate.
 */
export function computeTotals(
  lineItems: LineItemInput[],
  taxRatePct: number,
  amountPaidCents = 0,
  depositCents = 0
): FinancialTotals {
  let subtotal = 0;
  let discountTotal = 0;

  for (const li of lineItems) {
    const lineTotal = Math.round(li.unitPriceCents * li.quantity);
    if (li.itemType === "DISCOUNT") {
      discountTotal += Math.abs(lineTotal);
    } else {
      subtotal += lineTotal;
    }
  }

  const taxableSubtotal = lineItems
    .filter((li) => li.taxable && li.itemType !== "DISCOUNT")
    .reduce((s, li) => s + Math.round(li.unitPriceCents * li.quantity), 0);

  const taxTotal = Math.round(taxableSubtotal * taxRatePct);
  const total = subtotal - discountTotal + taxTotal;
  const balance = Math.max(0, total - amountPaidCents);

  return {
    subtotalCents: subtotal,
    taxCents: taxTotal,
    discountCents: discountTotal,
    totalCents: total,
    balanceCents: balance,
  };
}

/**
 * Get the next invoice number atomically.
 */
export async function getNextInvoiceNumber(organizationId: string): Promise<{
  invoiceNumber: string;
  prefix: string;
  counter: number;
}> {
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { invoiceCounter: { increment: 1 } },
    select: { invoiceCounter: true, invoicePrefix: true },
  });

  const invoiceNumber = `${org.invoicePrefix}-${String(org.invoiceCounter).padStart(6, "0")}`;
  return { invoiceNumber, prefix: org.invoicePrefix, counter: org.invoiceCounter };
}

/**
 * Recompute and update invoice balance + status after a payment.
 */
export async function reconcileInvoiceAfterPayment(
  invoiceId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalCents: true, amountPaidCents: true, status: true },
  });
  if (!invoice) return;

  const balance = Math.max(0, invoice.totalCents - invoice.amountPaidCents);
  let newStatus = invoice.status;

  if (invoice.amountPaidCents <= 0) {
    newStatus = "SENT";
  } else if (balance <= 0) {
    newStatus = "PAID";
  } else {
    newStatus = "PARTIALLY_PAID";
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      balanceCents: balance,
      status: newStatus,
      paidAt: balance <= 0 ? new Date() : null,
    },
  });
}

/**
 * Build InvoiceLineItem create payloads from input.
 */
export function buildLineItemCreateData(
  lineItems: LineItemInput[],
  organizationId: string
): Prisma.InvoiceLineItemCreateManyInvoiceInput[] {
  return lineItems.map((li, idx) => ({
    organizationId,
    itemType: li.itemType,
    description: li.description,
    quantity: li.quantity,
    unitCostCents: li.unitCostCents ?? 0,
    unitPriceCents: li.unitPriceCents,
    totalCents: Math.round(
      li.itemType === "DISCOUNT"
        ? -Math.abs(li.unitPriceCents * li.quantity)
        : li.unitPriceCents * li.quantity
    ),
    taxable: li.taxable ?? true,
    category: li.category,
    warranty: li.warranty,
    laborHours: li.laborHours,
    technicianId: li.technicianId,
    jobLineItemId: li.jobLineItemId,
    estimateLineItemId: li.estimateLineItemId,
    sortOrder: idx,
  }));
}

/**
 * Log an invoice timeline event.
 */
export async function logInvoiceEvent(
  invoiceId: string,
  eventType: string,
  options?: { userId?: string; note?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId,
      eventType,
      userId: options?.userId,
      note: options?.note,
      metadata: options?.metadata as any,
    },
  });
}
