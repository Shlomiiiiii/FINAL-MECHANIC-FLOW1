"use client";

import { Badge } from "@/components/ui/badge";
import { Shield, Star, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  membership: {
    status: string;
    plan: {
      name: string;
      color: string | null;
      tier: number;
    };
  } | null;
  compact?: boolean;
}

const TIER_ICONS = [Shield, Star, Crown];
const STATUS_VARIANT: Record<string, string> = {
  active:    "bg-green-100 text-green-800 border-green-200",
  trialing:  "bg-blue-100 text-blue-800 border-blue-200",
  past_due:  "bg-amber-100 text-amber-800 border-amber-200",
  paused:    "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

export function MemberBadge({ membership, compact = false }: Props) {
  if (!membership || !["active","trialing","past_due","paused"].includes(membership.status)) {
    return null;
  }

  const TierIcon = TIER_ICONS[Math.min(membership.plan.tier, TIER_ICONS.length - 1)] ?? Shield;
  const color    = membership.plan.color ?? "#3b82f6";
  const statusCls = STATUS_VARIANT[membership.status] ?? STATUS_VARIANT.active;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
        style={{ backgroundColor: color + "20", color, borderColor: color + "40" }}>
        <TierIcon className="h-2.5 w-2.5" />
        {membership.plan.name}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
        style={{ backgroundColor: color + "15", color, borderColor: color + "30" }}>
        <TierIcon className="h-3.5 w-3.5" />
        {membership.plan.name} Member
      </span>
      {membership.status !== "active" && (
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", statusCls)}>
          {membership.status.replace("_"," ")}
        </span>
      )}
    </div>
  );
}
