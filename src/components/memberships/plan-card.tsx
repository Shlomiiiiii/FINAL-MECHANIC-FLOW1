"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Users, Edit, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanBenefit } from "@/lib/memberships";

interface PlanCardProps {
  plan: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    tier: number;
    monthlyPriceCents: number;
    yearlyPriceCents: number;
    status: string;
    benefits: unknown;
    _count?: { memberships: number };
  };
  showActions?: boolean;
  onEnroll?: () => void;
  isSelected?: boolean;
}

const TIER_LABELS = ["Bronze","Silver","Gold","Platinum","Diamond"];

export function PlanCard({ plan, showActions = true, onEnroll, isSelected }: PlanCardProps) {
  const color   = plan.color ?? "#3b82f6";
  const benefits = Array.isArray(plan.benefits) ? plan.benefits as PlanBenefit[] : [];
  const tierLabel = TIER_LABELS[plan.tier] ?? `Tier ${plan.tier}`;
  const activeCount = plan._count?.memberships ?? 0;

  const monthlyDisplay = `$${(plan.monthlyPriceCents / 100).toFixed(0)}/mo`;
  const yearlyDisplay  = plan.yearlyPriceCents > 0
    ? `$${(plan.yearlyPriceCents / 100 / 12).toFixed(0)}/mo billed yearly`
    : null;

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden flex flex-col transition-all",
      isSelected ? "ring-2 ring-primary border-primary shadow-lg" : "border-border hover:border-border-strong hover:shadow-sm"
    )}>
      {/* Color header */}
      <div className="h-1.5" style={{ backgroundColor: color }} />

      <div className="p-5 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {plan.icon && <span className="text-lg">{plan.icon}</span>}
              <h3 className="font-semibold text-foreground">{plan.name}</h3>
              <Badge variant="secondary" className="text-[10px]">{tierLabel}</Badge>
            </div>
            {plan.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.description}</p>
            )}
          </div>
          {plan.status !== "active" && (
            <Badge variant={plan.status === "paused" ? "warning" : "secondary"} className="text-[10px] flex-shrink-0">
              {plan.status}
            </Badge>
          )}
        </div>

        {/* Pricing */}
        <div className="mb-4">
          <span className="text-2xl font-bold text-foreground">{monthlyDisplay}</span>
          {yearlyDisplay && (
            <p className="text-xs text-green-600 mt-0.5">{yearlyDisplay} — save {Math.round((1 - (plan.yearlyPriceCents / 12) / plan.monthlyPriceCents) * 100)}%</p>
          )}
        </div>

        {/* Benefits */}
        <ul className="space-y-1.5 mb-4">
          {benefits.slice(0, 5).map((benefit) => (
            <li key={benefit.id} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>{benefit.name}
                {benefit.limitType === "per_period" && benefit.limitValue && (
                  <span className="text-muted-foreground/70"> ({benefit.limitValue}×/{benefit.interval ?? "mo"})</span>
                )}
                {benefit.discountPct && (
                  <span className="text-green-600 font-medium"> ({benefit.discountPct}% off)</span>
                )}
              </span>
            </li>
          ))}
          {benefits.length > 5 && (
            <li className="text-xs text-muted-foreground/60">+{benefits.length - 5} more benefits</li>
          )}
        </ul>

        {/* Members count */}
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Users className="h-3.5 w-3.5" />
            <span>{activeCount} active member{activeCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div className="px-5 pb-5 flex gap-2">
          {onEnroll ? (
            <Button size="sm" className="flex-1" style={{ backgroundColor: color, color: "#fff" }}
              onClick={onEnroll}>
              Enroll customer
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="flex-1 gap-1.5" asChild>
                <Link href={`/memberships/plans/${plan.id}`}>
                  <BarChart3 className="h-3.5 w-3.5" /> View
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link href={`/memberships/plans/${plan.id}?edit=1`}>
                  <Edit className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
