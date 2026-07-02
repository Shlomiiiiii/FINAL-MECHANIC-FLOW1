"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, AlertTriangle, Gift, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BenefitStatus } from "@/lib/memberships";

interface Props {
  membershipId: string;
  benefitStatuses: BenefitStatus[];
  jobId?: string;
  onRedeemed?: () => void;
}

export function BenefitStatusPanel({ membershipId, benefitStatuses, jobId, onRedeemed }: Props) {
  const { toast } = useToast();
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const available = benefitStatuses.filter(b => b.isAvailable);
  const used      = benefitStatuses.filter(b => !b.isAvailable);

  const handleRedeem = async (bs: BenefitStatus) => {
    setRedeeming(bs.benefit.id);
    try {
      const res = await fetch(`/api/memberships/members/${membershipId}/benefits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          benefitId:   bs.benefit.id,
          benefitName: bs.benefit.name,
          quantity:    1,
          jobId,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast({ title: json.error?.message ?? "Failed to redeem", variant: "destructive" });
        return;
      }
      toast({ title: `✓ ${bs.benefit.name} redeemed` });
      onRedeemed?.();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setRedeeming(null);
    }
  };

  if (benefitStatuses.length === 0) {
    return <p className="text-sm text-muted-foreground">No benefits on this plan.</p>;
  }

  return (
    <div className="space-y-3">
      {available.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" /> Available benefits
          </p>
          <div className="space-y-2">
            {available.map((bs) => (
              <div key={bs.benefit.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-green-900">{bs.benefit.name}</p>
                    {bs.benefit.description && (
                      <p className="text-xs text-green-700 mt-0.5">{bs.benefit.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {bs.benefit.limitType === "per_period" && bs.remaining !== "unlimited" && (
                        <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                          {bs.remaining} remaining this period
                        </span>
                      )}
                      {bs.benefit.limitType === "unlimited" && (
                        <span className="text-[10px] text-green-700">Unlimited</span>
                      )}
                      {bs.benefit.discountPct && (
                        <span className="text-[10px] text-green-800 font-semibold">{bs.benefit.discountPct}% off</span>
                      )}
                    </div>
                  </div>
                </div>
                {jobId && ["free_service","included_service","flat_credit"].includes(bs.benefit.type) && (
                  <Button size="sm" variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-100 flex-shrink-0"
                    disabled={redeeming === bs.benefit.id}
                    onClick={() => handleRedeem(bs)}>
                    {redeeming === bs.benefit.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : "Apply"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {used.length > 0 && (
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {used.length} used/exhausted benefit{used.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-1.5 mt-2">
            {used.map((bs) => (
              <div key={bs.benefit.id}
                className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border opacity-60">
                <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{bs.benefit.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {bs.benefit.limitType === "one_time" ? "Already used" :
                     `${bs.used} used of ${bs.benefit.limitValue} — resets ${bs.nextResetAt?.toLocaleDateString() ?? "at period end"}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
