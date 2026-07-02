"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/validations/customer";

interface DuplicateWarning {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phonePrimary: string | null;
  companyName: string | null;
}

interface Props {
  mode: "create" | "edit";
  customerId?: string;
  defaultValues?: Partial<CustomerFormValues>;
  onSuccess?: (customerId: string) => void;
}

interface CustomerFormValues {
  firstName: string;
  lastName: string;
  companyName: string;
  isCommercial: boolean;
  email: string;
  phonePrimary: string;
  phoneSecondary: string;
  preferredContact: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  tags: string[];
  notes: string;
  doNotContact: boolean;
}

const PRESET_TAGS = ["vip", "fleet", "commercial", "repeat", "referral"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export function CustomerForm({ mode, customerId, defaultValues, onSuccess }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const dupCheckTimer = useRef<NodeJS.Timeout | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<DuplicateWarning | null>(null);
  const [tagInput, setTagInput] = useState("");

  const [form, setForm] = useState<CustomerFormValues>({
    firstName: defaultValues?.firstName ?? "",
    lastName: defaultValues?.lastName ?? "",
    companyName: defaultValues?.companyName ?? "",
    isCommercial: defaultValues?.isCommercial ?? false,
    email: defaultValues?.email ?? "",
    phonePrimary: defaultValues?.phonePrimary ?? "",
    phoneSecondary: defaultValues?.phoneSecondary ?? "",
    preferredContact: defaultValues?.preferredContact ?? "phone",
    addressLine1: defaultValues?.addressLine1 ?? "",
    addressLine2: defaultValues?.addressLine2 ?? "",
    city: defaultValues?.city ?? "",
    state: defaultValues?.state ?? "",
    zip: defaultValues?.zip ?? "",
    source: defaultValues?.source ?? "",
    tags: defaultValues?.tags ?? [],
    notes: defaultValues?.notes ?? "",
    doNotContact: defaultValues?.doNotContact ?? false,
  });

  const set = (field: keyof CustomerFormValues, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  // Phone auto-format
  const handlePhone = (field: "phonePrimary" | "phoneSecondary", value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    let formatted = digits;
    if (digits.length >= 7) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length >= 4) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else if (digits.length >= 1) {
      formatted = `(${digits}`;
    }
    set(field, formatted);
  };

  // Duplicate detection
  const checkDuplicate = async (email: string, phone: string) => {
    if (!email && !phone) { setDuplicate(null); return; }
    try {
      const qs = new URLSearchParams({
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(customerId ? { excludeId: customerId } : {}),
      });
      const res = await fetch(`/api/customers/check-duplicate?${qs}`);
      if (res.ok) {
        const json = await res.json();
        setDuplicate(json.data.duplicate);
      }
    } catch {}
  };

  const scheduleDupCheck = (email: string, phone: string) => {
    if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current);
    dupCheckTimer.current = setTimeout(() => checkDuplicate(email, phone), 600);
  };

  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase();
    if (!clean || form.tags.includes(clean) || form.tags.length >= 10) return;
    set("tags", [...form.tags, clean]);
    setTagInput("");
  };

  const removeTag = (tag: string) => set("tags", form.tags.filter((t) => t !== tag));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    const url = mode === "create" ? "/api/customers" : `/api/customers/${customerId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error?.details) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.error.details)) {
            mapped[k] = (v as string[])[0];
          }
          setErrors(mapped);
        } else {
          toast({ title: json.error?.message ?? "Something went wrong", variant: "destructive" });
        }
        return;
      }

      const id = json.data.customer.id;
      toast({
        title: mode === "create" ? "Customer created" : "Changes saved",
        variant: "default",
      });

      if (onSuccess) {
        onSuccess(id);
      } else {
        router.push(`/customers/${id}`);
        router.refresh();
      }
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Duplicate warning */}
      {duplicate && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Possible duplicate detected</p>
            <p className="text-muted-foreground mt-0.5">
              <a href={`/customers/${duplicate.id}`} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                {duplicate.firstName} {duplicate.lastName}
              </a>{" "}
              {duplicate.companyName && `(${duplicate.companyName}) `}
              already exists with this {duplicate.email === form.email ? "email" : "phone number"}.
            </p>
          </div>
        </div>
      )}

      {/* Basic info */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">Basic information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name <span className="text-destructive">*</span></Label>
            <Input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)}
              className={cn(errors.firstName && "border-destructive")} placeholder="Maria" />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name <span className="text-destructive">*</span></Label>
            <Input id="lastName" value={form.lastName} onChange={(e) => set("lastName", e.target.value)}
              className={cn(errors.lastName && "border-destructive")} placeholder="Santos" />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" value={form.companyName} onChange={(e) => set("companyName", e.target.value)}
              placeholder="Acme Landscaping LLC" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">How they found you</Label>
            <Select value={form.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger id="source"><SelectValue placeholder="Select source…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="repeat">Repeat customer</SelectItem>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">Contact information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="phonePrimary">Primary phone</Label>
            <Input id="phonePrimary" type="tel" value={form.phonePrimary}
              onChange={(e) => { handlePhone("phonePrimary", e.target.value); scheduleDupCheck(form.email, e.target.value); }}
              placeholder="(512) 555-0100" className={cn(errors.phonePrimary && "border-destructive")} />
            {errors.phonePrimary && <p className="text-xs text-destructive">{errors.phonePrimary}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phoneSecondary">Secondary phone</Label>
            <Input id="phoneSecondary" type="tel" value={form.phoneSecondary}
              onChange={(e) => handlePhone("phoneSecondary", e.target.value)}
              placeholder="(512) 555-0101" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" value={form.email}
              onChange={(e) => { set("email", e.target.value); scheduleDupCheck(e.target.value, form.phonePrimary); }}
              placeholder="maria@example.com" className={cn(errors.email && "border-destructive")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Preferred contact</Label>
            <Select value={form.preferredContact} onValueChange={(v) => set("preferredContact", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone call</SelectItem>
                <SelectItem value="sms">SMS / Text</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Address */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">Service address</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="addressLine1">Street address</Label>
            <Input id="addressLine1" value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} placeholder="1420 S Congress Ave" />
          </div>
          <Input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} placeholder="Suite, apt, unit…" />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Austin" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select value={form.state} onValueChange={(v) => set("state", v)}>
                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zip">ZIP code</Label>
              <Input id="zip" value={form.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="78704" maxLength={5} />
            </div>
          </div>
        </div>
      </section>

      {/* Tags */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">Tags</h3>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((tag) => (
              <button key={tag} type="button"
                onClick={() => form.tags.includes(tag) ? removeTag(tag) : addTag(tag)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  form.tags.includes(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}>
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
              placeholder="Add custom tag…" className="h-8 text-sm" />
            <Button type="button" size="sm" variant="outline" onClick={() => addTag(tagInput)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Notes */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">Internal notes</h3>
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="Any notes about this customer visible only to your team…"
          className="min-h-[100px]" maxLength={5000} />
        <p className="text-xs text-muted-foreground mt-1 text-right">{form.notes.length}/5000</p>
      </section>

      {/* Flags */}
      <section className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isCommercial}
            onChange={(e) => set("isCommercial", e.target.checked)}
            className="h-4 w-4 rounded border-input" />
          <span className="text-sm">Commercial account</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.doNotContact}
            onChange={(e) => set("doNotContact", e.target.checked)}
            className="h-4 w-4 rounded border-input" />
          <span className="text-sm text-destructive">Do not contact</span>
        </label>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="submit" disabled={isLoading} className="min-w-32">
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {mode === "create" ? "Creating…" : "Saving…"}</>
          ) : (
            mode === "create" ? "Create customer" : "Save changes"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
