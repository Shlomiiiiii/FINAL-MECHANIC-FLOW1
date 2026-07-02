"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, MessageSquare, FileText, Shield, Phone, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-orange-100 text-orange-700",
  CONVERTED: "bg-purple-100 text-purple-700",
};

type Action = "approve" | "decline" | "change_request" | null;

export function CustomerPortalClient({ estimate, estimateId }: { estimate: any; estimateId: string }) {
  const [action, setAction] = useState<Action>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const isTerminal = ["APPROVED", "DECLINED", "CONVERTED", "EXPIRED"].includes(estimate.status);
  const canAct = !isTerminal;

  const handleSubmit = async () => {
    if (!name.trim()) { setResult({ type: "error", message: "Please enter your name." }); return; }
    setIsSubmitting(true);
    setResult(null);

    try {
      const endpoint = action === "approve" ? "/api/portal/estimates/approve"
        : action === "decline" ? "/api/portal/estimates/decline"
        : "/api/portal/estimates/change-request";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateId,
          name: name.trim(),
          reason: message.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ type: "error", message: json.error?.message ?? "Something went wrong." });
      } else {
        setResult({
          type: "success",
          message: action === "approve"
            ? "Thank you! Your estimate has been approved. We'll be in touch shortly."
            : action === "decline"
            ? "Got it — we've noted your decision. Feel free to contact us if you change your mind."
            : "Your request has been sent. We'll follow up with a revised estimate.",
        });
        setAction(null);
      }
    } catch {
      setResult({ type: "error", message: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories = [...new Set(estimate.lineItems.map((li: any) => li.category ?? "Services"))];
  const grouped: Record<string, any[]> = {};
  for (const li of estimate.lineItems) {
    const cat = li.category ?? "Services";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(li);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-900 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white font-semibold text-lg">{estimate.organization.name}</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Estimate {estimate.estimateNumber}
                {estimate.createdAt && ` · ${new Date(estimate.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
              </p>
            </div>
            <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", STATUS_STYLES[estimate.status] ?? "bg-slate-100 text-slate-700")}>
              {estimate.status.charAt(0) + estimate.status.slice(1).toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 border-b border-slate-100">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">{estimate.title}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500">
            <span>For: <strong className="text-slate-800">{estimate.customer.firstName} {estimate.customer.lastName}</strong></span>
            {estimate.vehicle && (
              <span>Vehicle: <strong className="text-slate-800">{estimate.vehicle.year} {estimate.vehicle.make} {estimate.vehicle.model}</strong></span>
            )}
          </div>
          {estimate.expiresAt && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ This estimate expires on {new Date(estimate.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>

        {/* Line items */}
        <div className="px-6 py-5">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="mb-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{cat}</p>
              <div className="space-y-2">
                {(items as any[]).map((li: any, i: number) => (
                  <div key={i} className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">{li.description}</p>
                      {li.warranty && (
                        <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                          <Shield className="h-3 w-3" /> {li.warranty}
                        </p>
                      )}
                      {li.laborHours && (
                        <p className="text-xs text-slate-400">Est. {Number(li.laborHours).toFixed(1)} hours</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {Number(li.quantity) !== 1 && (
                        <p className="text-xs text-slate-400">{Number(li.quantity)} × {fmt(li.unitPriceCents)}</p>
                      )}
                      <p className="text-sm font-medium text-slate-800">{fmt(li.totalCents)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Totals */}
          <div className="border-t border-slate-100 pt-4 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span><span>{fmt(estimate.subtotalCents)}</span>
            </div>
            {estimate.discountCents > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span><span>-{fmt(estimate.discountCents)}</span>
              </div>
            )}
            {estimate.taxCents > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>{estimate.organization.taxLabel ?? "Tax"}</span><span>{fmt(estimate.taxCents)}</span>
              </div>
            )}
            {estimate.depositCents > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Deposit required</span><span>{fmt(estimate.depositCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
              <span>Total</span><span>{fmt(estimate.totalCents)}</span>
            </div>
          </div>
        </div>

        {/* Notes & warranty */}
        {(estimate.notes || estimate.warrantyText) && (
          <div className="px-6 pb-5 space-y-3">
            {estimate.warrantyText && (
              <div className="rounded-lg bg-green-50 border border-green-100 p-3 flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-0.5">Warranty included</p>
                  <p className="text-sm text-green-700">{estimate.warrantyText}</p>
                </div>
              </div>
            )}
            {estimate.notes && (
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-800 mb-1">Notes</p>
                <p>{estimate.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result message */}
      {result && (
        <div className={cn("rounded-xl p-4 mb-4 flex items-start gap-3",
          result.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
        )}>
          {result.type === "success"
            ? <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            : <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />}
          <p className={cn("text-sm", result.type === "success" ? "text-green-800" : "text-red-800")}>
            {result.message}
          </p>
        </div>
      )}

      {/* Action buttons */}
      {canAct && !result && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          {!action ? (
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-800 mb-4">Ready to proceed?</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={() => setAction("approve")} className="flex-1 bg-green-600 hover:bg-green-700 gap-2">
                  <CheckCircle className="h-4 w-4" /> Approve estimate
                </Button>
                <Button variant="outline" onClick={() => setAction("change_request")} className="flex-1 gap-2">
                  <MessageSquare className="h-4 w-4" /> Request changes
                </Button>
                <Button variant="outline" onClick={() => setAction("decline")} className="flex-1 text-red-600 border-red-200 hover:bg-red-50 gap-2">
                  <XCircle className="h-4 w-4" /> Decline
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                {action === "approve" && <><CheckCircle className="h-5 w-5 text-green-600" /><span className="font-semibold text-green-800">Approve estimate</span></>}
                {action === "decline" && <><XCircle className="h-5 w-5 text-red-600" /><span className="font-semibold text-red-800">Decline estimate</span></>}
                {action === "change_request" && <><MessageSquare className="h-5 w-5 text-blue-600" /><span className="font-semibold text-blue-800">Request changes</span></>}
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="portal-name">Your full name <span className="text-red-500">*</span></Label>
                  <Input id="portal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Santos" />
                </div>

                {action !== "approve" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-msg">
                      {action === "decline" ? "Reason (optional)" : "What changes would you like?"}
                    </Label>
                    <Textarea
                      id="portal-msg"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={action === "decline" ? "Any feedback for the shop…" : "Describe the changes you need…"}
                      className="min-h-[80px]"
                    />
                  </div>
                )}

                {action === "approve" && (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
                    By approving, you authorize {estimate.organization.name} to proceed with the work described above for {fmt(estimate.totalCents)}.
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={cn("flex-1",
                      action === "approve" ? "bg-green-600 hover:bg-green-700" :
                      action === "decline" ? "bg-red-600 hover:bg-red-700" : ""
                    )}
                  >
                    {isSubmitting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                      : action === "approve" ? "Confirm approval"
                      : action === "decline" ? "Confirm decline"
                      : "Send request"}
                  </Button>
                  <Button variant="outline" onClick={() => setAction(null)} disabled={isSubmitting}>Back</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Already acted */}
      {estimate.status === "APPROVED" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className="font-semibold text-green-900">Estimate approved</p>
          {estimate.approvedAt && (
            <p className="text-sm text-green-700 mt-1">
              Approved {new Date(estimate.approvedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {estimate.approvedByName ? ` by ${estimate.approvedByName}` : ""}
            </p>
          )}
        </div>
      )}

      {/* Contact */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
        <p className="text-sm font-semibold text-slate-800 mb-3">Questions? Contact us</p>
        <div className="flex flex-col gap-2">
          {estimate.organization.phone && (
            <a href={`tel:${estimate.organization.phone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <Phone className="h-4 w-4" /> {estimate.organization.phone}
            </a>
          )}
          {estimate.organization.email && (
            <a href={`mailto:${estimate.organization.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <Mail className="h-4 w-4" /> {estimate.organization.email}
            </a>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">Powered by MechanicFlow</p>
    </div>
  );
}
