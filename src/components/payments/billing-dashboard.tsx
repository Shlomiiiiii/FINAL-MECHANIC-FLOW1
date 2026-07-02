"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, Zap, Building2, Star, Loader2,
  ExternalLink, AlertTriangle, CreditCard, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, type PlanConfig } from "@/lib/stripe";

interface Props {
  currentPlan: string;
  subscription: {
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    amountCents: number;
    interval: string;
    trialEnd?: Date | null;
  } | null;
  connectStatus: {
    connected: boolean;
    onboarded: boolean;
    chargesEnabled: boolean;
  };
  userRole: string;
}

const PLAN_ICONS: Record<string, React.ElementType> = {
  STARTER: Zap,
  PRO: Star,
  GROWTH: Building2,
  ENTERPRISE: Building2,
};

export function BillingDashboard({ currentPlan, subscription, connectStatus, userRole }: Props) {
  const router  = useRouter();
  const { toast } = useToast();

  const [interval, setInterval]         = useState<"month" | "year">("month");
  const [isUpgrading, setIsUpgrading]   = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isOwner = userRole === "OWNER";

  const handleUpgrade = async (planId: string) => {
    if (!isOwner) { toast({ title: "Only the account owner can change plans", variant: "destructive" }); return; }
    setIsUpgrading(planId);
    try {
      const res = await fetch("/api/stripe/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }

      if (json.data.checkoutUrl) {
        window.location.href = json.data.checkoutUrl;
      } else {
        toast({ title: "Plan updated successfully" });
        router.refresh();
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsUpgrading(null);
    }
  };

  const handleConnectStripe = async () => {
    if (!isOwner) { toast({ title: "Only the account owner can connect Stripe", variant: "destructive" }); return; }
    setIsConnecting(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      window.location.href = json.data.url;
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBillingPortal = async () => {
    setIsPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/billing-portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      window.open(json.data.url, "_blank");
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll keep access until the end of your billing period.")) return;
    setIsCancelling(true);
    try {
      const res = await fetch("/api/stripe/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediately: false }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: "Subscription will cancel at period end" });
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const plans = Object.values(PLANS);

  return (
    <div className="space-y-8">

      {/* Current plan status */}
      <Card className={cn(subscription?.cancelAtPeriodEnd ? "border-amber-200 bg-amber-50/30" : "")}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Current plan</p>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xl font-bold">{PLANS[currentPlan]?.name ?? currentPlan}</p>
                <Badge variant={subscription?.status === "active" ? "success" : subscription?.status === "trialing" ? "info" : "secondary"}>
                  {subscription?.status === "trialing" ? "Trial" : subscription?.status ?? "Free"}
                </Badge>
              </div>
              {subscription && (
                <p className="text-sm text-muted-foreground">
                  {subscription.cancelAtPeriodEnd
                    ? `⚠️ Cancels ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                    : `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()} · $${(subscription.amountCents / 100).toFixed(2)}/${subscription.interval}`
                  }
                </p>
              )}
              {subscription?.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                <p className="text-sm text-blue-600 mt-1">
                  Trial ends {new Date(subscription.trialEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {subscription && isOwner && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleBillingPortal} disabled={isPortalLoading} className="gap-1.5">
                  {isPortalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Manage billing
                </Button>
                {!subscription.cancelAtPeriodEnd && (
                  <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                    {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancel plan"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stripe Connect status */}
      <Card className={cn(!connectStatus.onboarded && "border-amber-200")}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                connectStatus.chargesEnabled ? "bg-green-100" : "bg-amber-100")}>
                <CreditCard className={cn("h-5 w-5", connectStatus.chargesEnabled ? "text-green-600" : "text-amber-600")} />
              </div>
              <div>
                <p className="font-semibold text-foreground">Accept card payments</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {connectStatus.chargesEnabled
                    ? "Your Stripe account is connected. You can accept cards, Apple Pay, and Google Pay."
                    : "Connect your Stripe account to accept payments from customers."}
                </p>
                {connectStatus.chargesEnabled && (
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Cards</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Apple Pay</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Google Pay</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> ACH (future)</span>
                  </div>
                )}
              </div>
            </div>
            {!connectStatus.chargesEnabled && isOwner && (
              <Button onClick={handleConnectStripe} disabled={isConnecting} className="gap-1.5 flex-shrink-0">
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Connect Stripe
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan selector */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Plans</h3>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button onClick={() => setInterval("month")}
              className={cn("px-3 py-1 rounded-md text-sm font-medium transition-colors",
                interval === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              Monthly
            </button>
            <button onClick={() => setInterval("year")}
              className={cn("px-3 py-1 rounded-md text-sm font-medium transition-colors",
                interval === "year" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              Yearly <span className="text-green-600 text-xs font-semibold ml-1">-20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const PlanIcon  = PLAN_ICONS[plan.id] ?? Zap;
            const isCurrent = currentPlan === plan.id;
            const price     = interval === "year" ? plan.yearlyPriceCents : plan.monthlyPriceCents;
            const monthlyEq = interval === "year" ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;

            return (
              <div key={plan.id} className={cn(
                "rounded-xl border p-5 flex flex-col",
                isCurrent ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card"
              )}>
                <div className="flex items-center gap-2 mb-3">
                  <PlanIcon className={cn("h-5 w-5", isCurrent ? "text-primary" : "text-muted-foreground")} />
                  <span className="font-semibold">{plan.name}</span>
                  {isCurrent && <Badge variant="default" className="text-[10px] ml-auto">Current</Badge>}
                </div>

                <div className="mb-4">
                  <span className="text-2xl font-bold">${(monthlyEq / 100).toFixed(0)}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                  {interval === "year" && (
                    <p className="text-xs text-green-600 mt-0.5">
                      Billed ${(price / 100).toFixed(0)}/year
                    </p>
                  )}
                </div>

                <ul className="space-y-1.5 flex-1 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || !!isUpgrading || !isOwner}
                  variant={isCurrent ? "secondary" : "default"}
                  size="sm"
                  className="w-full"
                >
                  {isUpgrading === plan.id
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
                    : isCurrent ? "Current plan"
                    : currentPlan === "STARTER" || !subscription ? "Start 14-day trial"
                    : "Switch plan"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
