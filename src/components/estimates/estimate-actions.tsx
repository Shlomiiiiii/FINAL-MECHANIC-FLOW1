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
import { useToast } from "@/hooks/use-toast";
import {
  Send, ChevronDown, ExternalLink, FileText, ArrowRight,
  CheckCircle, XCircle, Loader2, RefreshCw, Printer,
} from "lucide-react";

interface Props {
  estimate: {
    id: string;
    status: string;
    estimateNumber: string;
    customer: { email: string | null; phonePrimary: string | null };
  };
  portalUrl: string;
  userRole: string;
}

export function EstimateActions({ estimate, portalUrl, userRole }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [sendDialog, setSendDialog] = useState(false);
  const [sendChannel, setSendChannel] = useState("email");

  const canSend = ["DRAFT","SENT"].includes(estimate.status);
  const canConvert = ["DRAFT","SENT","APPROVED"].includes(estimate.status);
  const canMarkApproved = ["DRAFT","SENT"].includes(estimate.status) && ["OWNER","MANAGER","OFFICE_STAFF"].includes(userRole);

  const handleSend = async () => {
    setIsSending(true);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: sendChannel }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed to send", variant: "destructive" }); return; }
      toast({ title: `Estimate sent via ${sendChannel}` });
      setSendDialog(false);
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleConvert = async () => {
    if (!confirm(`Convert ${estimate.estimateNumber} to a job?`)) return;
    setIsConverting(true);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "job" }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Conversion failed", variant: "destructive" }); return; }
      toast({ title: `Job ${json.data.jobNumber} created from estimate` });
      router.push(`/jobs/${json.data.job.id}`);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  const handleStatusChange = async (status: string, label: string) => {
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast({ title: "Failed to update status", variant: "destructive" }); return; }
      toast({ title: `Estimate marked as ${label}` });
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    window.open(`/api/estimates/${estimate.id}/pdf`, "_blank");
  };

  return (
    <>
      {canSend && (
        <Button size="sm" className="gap-1.5" onClick={() => setSendDialog(true)}>
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
          <DropdownMenuItem onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> View / Print PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open(portalUrl, "_blank")} className="gap-2">
            <ExternalLink className="h-4 w-4" /> Preview portal
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canMarkApproved && (
            <DropdownMenuItem onClick={() => handleStatusChange("APPROVED","Approved")} className="gap-2 text-green-700">
              <CheckCircle className="h-4 w-4" /> Mark approved
            </DropdownMenuItem>
          )}
          {["DRAFT","SENT"].includes(estimate.status) && (
            <DropdownMenuItem onClick={() => handleStatusChange("DECLINED","Declined")} className="gap-2 text-destructive focus:text-destructive">
              <XCircle className="h-4 w-4" /> Mark declined
            </DropdownMenuItem>
          )}
          {canConvert && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleConvert} disabled={isConverting} className="gap-2">
                {isConverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Convert to job
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Send dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Send estimate
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Send via</label>
              <Select value={sendChannel} onValueChange={setSendChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {estimate.customer.email && <SelectItem value="email">Email — {estimate.customer.email}</SelectItem>}
                  {estimate.customer.phonePrimary && <SelectItem value="sms">SMS — {estimate.customer.phonePrimary}</SelectItem>}
                  {estimate.customer.email && estimate.customer.phonePrimary && <SelectItem value="both">Both email + SMS</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Customer will receive a link to review and approve the estimate online.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={isSending} className="gap-1.5">
              {isSending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
