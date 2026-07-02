import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@prisma/client";

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
  dot: string;
}> = {
  DRAFT:          { label: "Draft",          variant: "secondary",   dot: "bg-slate-400" },
  SENT:           { label: "Sent",           variant: "info",        dot: "bg-blue-500" },
  VIEWED:         { label: "Viewed",         variant: "info",        dot: "bg-blue-400" },
  PARTIALLY_PAID: { label: "Partial",        variant: "warning",     dot: "bg-amber-500" },
  PAID:           { label: "Paid",           variant: "success",     dot: "bg-green-500" },
  OVERDUE:        { label: "Overdue",        variant: "destructive", dot: "bg-red-500" },
  CANCELLED:      { label: "Cancelled",      variant: "outline",     dot: "bg-slate-300" },
  REFUNDED:       { label: "Refunded",       variant: "secondary",   dot: "bg-purple-400" },
  ARCHIVED:       { label: "Archived",       variant: "outline",     dot: "bg-slate-200" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = INVOICE_STATUS_CONFIG[status];
  return (
    <Badge variant={cfg.variant} className="text-[10px] py-0 gap-1.5 pl-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </Badge>
  );
}
