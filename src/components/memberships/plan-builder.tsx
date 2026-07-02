"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Loader2, GripVertical,
  CheckCircle, Percent, DollarSign, Clock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanBenefit, BenefitType } from "@/lib/memberships";

const BENEFIT_TYPES: { value: BenefitType; label: string; icon: React.ElementType; description: string }[] = [
  { value: "free_service",         label: "Free service",         icon: CheckCircle, description: "e.g. Free oil change, free tire rotation" },
  { value: "included_service",     label: "Included service",     icon: CheckCircle, description: "One-time or recurring included service" },
  { value: "labor_discount",       label: "Labor discount %",     icon: Percent,     description: "% off all labor charges" },
  { value: "parts_discount",       label: "Parts discount %",     icon: Percent,     description: "% off parts" },
  { value: "flat_credit",          label: "$ Credit",             icon: DollarSign,  description: "Dollar credit applied per period" },
  { value: "priority_scheduling",  label: "Priority scheduling",  icon: Clock,       description: "Jump to front of scheduling queue" },
  { value: "loyalty_bonus",        label: "Loyalty point bonus",  icon: Zap,         description: "Extra points multiplier" },
  { value: "custom",               label: "Custom benefit",       icon: CheckCircle, description: "Freeform benefit description" },
];

let idCounter = 0;
const uid = () => `b_${Date.now()}_${++idCounter}`;

interface Props {
  mode: "create" | "edit";
  planId?: string;
  defaultValues?: any;
}

const PLAN_COLORS = ["#b45309","#64748b","#d97706","#1d4ed8","#7c3aed","#0f766e","#be185d","#dc2626"];
const PLAN_EMOJIS = ["🥉","🥈","🥇","💎","⭐","🚀","🔧","🛡️","🏆","⚡"];

export function PlanBuilder({ mode, planId, defaultValues }: Props) {
  const router  = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [benefitDialog, setBenefitDialog] = useState(false);

  const [form, setForm] = useState({
    name:                 defaultValues?.name ?? "",
    slug:                 defaultValues?.slug ?? "",
    description:          defaultValues?.description ?? "",
    color:                defaultValues?.color ?? PLAN_COLORS[0],
    icon:                 defaultValues?.icon ?? PLAN_EMOJIS[0],
    tier:                 String(defaultValues?.tier ?? "0"),
    monthlyPriceCents:    defaultValues?.monthlyPriceCents ? String(defaultValues.monthlyPriceCents / 100) : "",
    yearlyPriceCents:     defaultValues?.yearlyPriceCents  ? String(defaultValues.yearlyPriceCents  / 100) : "",
    enrollmentFeeCents:   defaultValues?.enrollmentFeeCents   ? String(defaultValues.enrollmentFeeCents   / 100) : "0",
    cancellationFeeCents: defaultValues?.cancellationFeeCents ? String(defaultValues.cancellationFeeCents / 100) : "0",
    trialDays:            String(defaultValues?.trialDays ?? "0"),
    maxVehicles:          String(defaultValues?.maxVehicles ?? "1"),
    maxMembers:           String(defaultValues?.maxMembers  ?? "1"),
    status:               defaultValues?.status ?? "active",
    isPublic:             defaultValues?.isPublic ?? true,
    loyaltyPointsPerDollar: String(defaultValues?.loyaltyPointsPerDollar ?? "0"),
    notes:                defaultValues?.notes ?? "",
  });

  const [benefits, setBenefits] = useState<PlanBenefit[]>(
    Array.isArray(defaultValues?.benefits) ? defaultValues.benefits : []
  );

  const [newBenefit, setNewBenefit] = useState<Partial<PlanBenefit>>({
    type: "free_service", limitType: "per_period", limitValue: 1, interval: "month",
  });

  const set = (k: string, v: string | boolean) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: "" }));
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleNameChange = (v: string) => {
    set("name", v);
    if (!defaultValues?.slug) set("slug", autoSlug(v));
  };

  const addBenefit = () => {
    if (!newBenefit.name?.trim()) return;
    setBenefits(prev => [...prev, { ...newBenefit, id: uid() } as PlanBenefit]);
    setNewBenefit({ type: "free_service", limitType: "per_period", limitValue: 1, interval: "month" });
    setBenefitDialog(false);
  };

  const removeBenefit = (id: string) => setBenefits(prev => prev.filter(b => b.id !== id));

  const parseCents = (val: string) => Math.round(parseFloat(val || "0") * 100);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())   errs.name   = "Name is required";
    if (!form.slug.trim())   errs.slug   = "Slug is required";
    if (!/^[a-z0-9-]+$/.test(form.slug)) errs.slug = "Lowercase letters, numbers, hyphens only";
    if (!form.monthlyPriceCents || parseFloat(form.monthlyPriceCents) < 0) errs.monthlyPriceCents = "Monthly price is required";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setIsLoading(true);
    try {
      const payload = {
        name:                 form.name.trim(),
        slug:                 form.slug.trim(),
        description:          form.description || undefined,
        color:                form.color,
        icon:                 form.icon,
        tier:                 parseInt(form.tier),
        monthlyPriceCents:    parseCents(form.monthlyPriceCents),
        yearlyPriceCents:     parseCents(form.yearlyPriceCents),
        enrollmentFeeCents:   parseCents(form.enrollmentFeeCents),
        cancellationFeeCents: parseCents(form.cancellationFeeCents),
        trialDays:            parseInt(form.trialDays),
        maxVehicles:          parseInt(form.maxVehicles),
        maxMembers:           parseInt(form.maxMembers),
        status:               form.status,
        isPublic:             form.isPublic,
        loyaltyPointsPerDollar: parseInt(form.loyaltyPointsPerDollar),
        notes:                form.notes || undefined,
        benefits,
      };

      const url    = mode === "create" ? "/api/memberships/plans" : `/api/memberships/plans/${planId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();

      if (!res.ok) {
        if (json.error?.details) {
          const d: Record<string,string> = {};
          for (const [k,v] of Object.entries(json.error.details)) d[k] = (v as string[])[0];
          setErrors(d);
        } else {
          toast({ title: json.error?.message ?? "Failed to save", variant: "destructive" });
        }
        return;
      }

      toast({ title: mode === "create" ? "Plan created" : "Plan updated" });
      router.push(`/memberships/plans/${json.data.plan.id}`);
      router.refresh();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  const selectedBenefitType = BENEFIT_TYPES.find(b => b.value === newBenefit.type);

  return (
    <div className="space-y-8">

      {/* Plan identity */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Plan details</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Plan name <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Silver Maintenance Plan"
              className={cn(errors.name && "border-destructive")} />
            <FieldError field="name" />
          </div>
          <div className="space-y-1.5">
            <Label>URL slug <span className="text-destructive">*</span></Label>
            <Input value={form.slug} onChange={e => set("slug", e.target.value)}
              placeholder="silver-maintenance"
              className={cn("font-mono text-sm", errors.slug && "border-destructive")} />
            <FieldError field="slug" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={e => set("description", e.target.value)}
            placeholder="What's included and why customers should join…" className="min-h-[80px]" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_COLORS.map(c => (
                <button key={c} type="button" onClick={() => set("color", c)}
                  className={cn("h-7 w-7 rounded-lg border-2 transition-all",
                    form.color === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Emoji */}
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1">
              {PLAN_EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => set("icon", e)}
                  className={cn("h-7 w-7 rounded flex items-center justify-center text-sm border transition-colors",
                    form.icon === e ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground")}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Tier */}
          <div className="space-y-1.5">
            <Label>Tier (0 = lowest)</Label>
            <Input type="number" min="0" max="10" value={form.tier}
              onChange={e => set("tier", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Pricing</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Monthly price <span className="text-destructive">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input type="number" step="0.01" min="0" value={form.monthlyPriceCents}
                onChange={e => set("monthlyPriceCents", e.target.value)}
                className={cn("pl-7", errors.monthlyPriceCents && "border-destructive")} placeholder="29.99" />
            </div>
            <FieldError field="monthlyPriceCents" />
          </div>
          <div className="space-y-1.5">
            <Label>Yearly price <span className="text-xs text-muted-foreground">(optional, creates savings)</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input type="number" step="0.01" min="0" value={form.yearlyPriceCents}
                onChange={e => set("yearlyPriceCents", e.target.value)}
                className="pl-7" placeholder="299.99" />
            </div>
            {form.yearlyPriceCents && form.monthlyPriceCents && (
              <p className="text-xs text-green-600">
                Saves ${((parseFloat(form.monthlyPriceCents) * 12) - parseFloat(form.yearlyPriceCents)).toFixed(2)}/year vs monthly
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Enrollment fee</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input type="number" min="0" value={form.enrollmentFeeCents}
                onChange={e => set("enrollmentFeeCents", e.target.value)} className="pl-7" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cancellation fee</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input type="number" min="0" value={form.cancellationFeeCents}
                onChange={e => set("cancellationFeeCents", e.target.value)} className="pl-7" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Free trial days</Label>
            <Input type="number" min="0" max="90" value={form.trialDays}
              onChange={e => set("trialDays", e.target.value)} placeholder="0" />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Benefits</h3>
            <p className="text-xs text-muted-foreground mt-0.5">What members get with this plan</p>
          </div>
          <Button size="sm" type="button" className="gap-1.5" onClick={() => setBenefitDialog(true)}>
            <Plus className="h-3.5 w-3.5" /> Add benefit
          </Button>
        </div>

        {benefits.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground">No benefits yet. Add what members receive.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {benefits.map((b, idx) => {
              const BType = BENEFIT_TYPES.find(bt => bt.value === b.type);
              const Icon  = BType?.icon ?? CheckCircle;
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background group">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 cursor-grab" />
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.limitType === "unlimited" && "Unlimited"}
                      {b.limitType === "per_period" && b.limitValue && `${b.limitValue}× per ${b.interval ?? "month"}`}
                      {b.limitType === "one_time" && "One-time"}
                      {b.discountPct && ` · ${b.discountPct}% off`}
                      {b.discountCents && ` · $${(b.discountCents / 100).toFixed(2)} credit`}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeBenefit(b.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Settings */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Settings</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Max vehicles per member</Label>
            <Input type="number" min="1" value={form.maxVehicles}
              onChange={e => set("maxVehicles", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Max members (family)</Label>
            <Input type="number" min="1" value={form.maxMembers}
              onChange={e => set("maxMembers", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Loyalty pts / $1 spent</Label>
            <Input type="number" min="0" value={form.loyaltyPointsPerDollar}
              onChange={e => set("loyaltyPointsPerDollar", e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={form.isPublic} onChange={e => set("isPublic", e.target.checked)}
              className="h-4 w-4 rounded" />
            Visible on customer portal
          </label>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={isLoading} className="min-w-36">
          {isLoading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            : mode === "create" ? "Create plan" : "Save changes"}
        </Button>
        <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
      </div>

      {/* Add benefit dialog */}
      <Dialog open={benefitDialog} onOpenChange={setBenefitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add benefit</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Benefit type</Label>
              <Select value={newBenefit.type} onValueChange={v => setNewBenefit(p => ({ ...p, type: v as BenefitType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BENEFIT_TYPES.map(bt => (
                    <SelectItem key={bt.value} value={bt.value}>
                      <span className="font-medium">{bt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBenefitType && (
                <p className="text-xs text-muted-foreground">{selectedBenefitType.description}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Benefit name</Label>
              <Input value={newBenefit.name ?? ""} onChange={e => setNewBenefit(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Free Synthetic Oil Change" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input value={newBenefit.description ?? ""} onChange={e => setNewBenefit(p => ({ ...p, description: e.target.value }))}
                placeholder="More details…" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Limit</Label>
                <Select value={newBenefit.limitType} onValueChange={v => setNewBenefit(p => ({ ...p, limitType: v as any }))}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="per_period">Per period</SelectItem>
                    <SelectItem value="one_time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newBenefit.limitType === "per_period" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Count</Label>
                    <Input type="number" min="1" value={newBenefit.limitValue ?? 1}
                      onChange={e => setNewBenefit(p => ({ ...p, limitValue: parseInt(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Interval</Label>
                    <Select value={newBenefit.interval ?? "month"} onValueChange={v => setNewBenefit(p => ({ ...p, interval: v as any }))}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">/ month</SelectItem>
                        <SelectItem value="year">/ year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            {["labor_discount","parts_discount","service_discount"].includes(newBenefit.type ?? "") && (
              <div className="space-y-1.5">
                <Label>Discount %</Label>
                <Input type="number" min="0" max="100"
                  value={newBenefit.discountPct ?? ""}
                  onChange={e => setNewBenefit(p => ({ ...p, discountPct: parseInt(e.target.value) }))}
                  placeholder="10" />
              </div>
            )}
            {newBenefit.type === "flat_credit" && (
              <div className="space-y-1.5">
                <Label>Credit amount ($)</Label>
                <Input type="number" min="0" step="0.01"
                  value={newBenefit.discountCents ? newBenefit.discountCents / 100 : ""}
                  onChange={e => setNewBenefit(p => ({ ...p, discountCents: Math.round(parseFloat(e.target.value) * 100) }))}
                  placeholder="10.00" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBenefitDialog(false)}>Cancel</Button>
            <Button onClick={addBenefit} disabled={!newBenefit.name?.trim()}>Add benefit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
