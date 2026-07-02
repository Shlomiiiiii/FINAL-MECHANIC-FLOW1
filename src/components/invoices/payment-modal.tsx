"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, DollarSign } from "lucide-react";

interface Props {
  invoiceId: string;
  balanceCents: number;
  invoiceNumber: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (payment: any) => void;
}

const METHODS = [
  { value: "CARD",         label: "Credit / Debit Card" },
  { value: "CASH",         label: "Cash" },
  { value: "CHECK",        label: "Check" },
  { value: "ACH",          label: "ACH Bank Transfer" },
  { value: "CARD_PRESENT", label: "Card Present (Terminal)" },
  { value: "OTHER",        label: "Other" },
];

export function PaymentModal({ invoiceId, balanceCents, invoiceNumber, open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [method, setMethod]       = useState("CARD");
  const [amountInput, setAmountInput] = useState((balanceCents / 100).toFixed(2));
  const [notes, setNotes]         = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const amountCents = Math.round(parseFloat(amountInput || "0") * 100);
  const isValid     = amountCents > 0 && amountCents <= balanceCents;

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, method, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error?.message ?? "Payment failed", variant: "destructive" });
        return;
      }
      toast({ title: `$${(amountCents / 100).toFixed(2)} recorded successfully` });
      onSuccess(json.data.payment);
      onClose();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Record payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/60 p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Balance due on {invoiceNumber}</span>
            <span className="font-bold text-foreground">${(balanceCents / 100).toFixed(2)}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Payment amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={(balanceCents / 100).toFixed(2)}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="pl-8 text-lg font-semibold"
              />
            </div>
            {amountCents > balanceCents && (
              <p className="text-xs text-destructive">Amount exceeds balance due</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Reference / notes (optional)</Label>
            <Input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Check #, reference…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isValid || isLoading} className="gap-1.5 bg-green-600 hover:bg-green-700">
            {isLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              : `Record $${(amountCents / 100).toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
