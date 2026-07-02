"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PaymentModal } from "./payment-modal";
import { useToast } from "@/hooks/use-toast";
import {
  Send, ChevronDown, Printer, ExternalLink, DollarSign,
  XCircle, Loader2, RotateCcw, Archive,
} from "lucide-react";

interface Props {
  invoice: {
    id: string;
    status: string;
    invoiceNumber: string;
    balanceCents: number;
    totalCents: number;
    customer: { email: string | null; phonePrimary: string | null };
  };
  portalUrl: string;
  pdfUrl: string;
  userRole: string;
}

export function InvoiceDetailClient({ invoice, portalUrl, pdfUrl, userRole }: Props) {
  const router  = useRouter();
  const { toast } = useToast();

  const [paymentOpen, setPaymentOpen]   = useState(false);
  const [sendDialog, setSendDialog]     = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [sendChannel, setSendChannel]   = useState("email");
  const [cancelReason, setCancelReason] = useState("");
  const [isSending, setIsSending]       = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const canSend    = ["DRAFT","SENT","VIEWED","OVERDUE"].includes(invoice.status);
  const canPay     = invoice.balanceCents > 0 && !["CANCELLED","ARCHIVED","PAID"].includes(invoice.status);
  const canCancel  = !["CANCELLED","PAID","ARCHIVED"].includes(invoice.status);
  const canArchive = ["PAID","CANCELLED","REFUNDED"].includes(invoice.status);
  const isManager  = ["OWNER","MANAGER","OFFICE_STAFF"].includes(userRole);

  const handleSend = async () => {
    setIsSending(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: sendChannel }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Send failed", variant: "destructive" }); return; }
      toast({ title: `Invoice sent via ${sendChannel}` });
      setSendDialog(false);
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Cancel failed", variant: "destructive" }); return; }
      toast({ title: "Invoice cancelled" });
      setCancelDialog(false);
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleArchive = async () => {
    const res = await fetch(`/api/invoices/${invoice.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    if (res.ok) { toast({ title: "Invoice archived" }); router.refresh(); }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {canPay && isManager && (
          <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => setPaymentOpen(true)}>
            <DollarSign className="h-3.5 w-3.5" /> Record payment
          </Button>
        )}

        {canSend && isManager && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSendDialog(true)}>
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              More <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => window.open(pdfUrl, "_blank")} className="gap-2">
              <Printer className="h-4 w-4" /> View / Print PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(portalUrl, "_blank")} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Preview portal
            </DropdownMenuItem>
            {canArchive && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleArchive} className="gap-2">
                  <Archive className="h-4 w-4" /> Archive
                </DropdownMenuItem>
              </>
            )}
            {canCancel && isManager && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setCancelDialog(true)}
                  className="gap-2 text-destructive focus:text-destructive">
                  <XCircle className="h-4 w-4" /> Cancel invoice
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Payment modal */}
      <PaymentModal
        invoiceId={invoice.id}
        balanceCents={invoice.balanceCents}
        invoiceNumber={invoice.invoiceNumber}
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => { setPaymentOpen(false); router.refresh(); }}
      />

      {/* Send dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Select value={sendChannel} onValueChange={setSendChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {invoice.customer.email && <SelectItem value="email">Email — {invoice.customer.email}</SelectItem>}
                {invoice.customer.phonePrimary && <SelectItem value="sms">SMS — {invoice.customer.phonePrimary}</SelectItem>}
                {invoice.customer.email && invoice.customer.phonePrimary && <SelectItem value="both">Both email + SMS</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Customer receives a payment link to the secure portal.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={isSending} className="gap-1.5">
              {isSending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Cancel invoice</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">This will cancel {invoice.invoiceNumber} and cannot be undone.</p>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation (optional)…" className="min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Back</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling} className="gap-1.5">
              {isCancelling ? <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling…</> : "Cancel invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
