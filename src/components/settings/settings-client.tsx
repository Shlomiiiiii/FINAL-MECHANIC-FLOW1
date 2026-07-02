"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Eye, EyeOff, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgData {
  id: string; name: string; slug: string; phone: string | null;
  email: string | null; website: string | null;
  addressLine1: string | null; addressLine2: string | null;
  city: string | null; state: string | null; zip: string | null;
  country: string; timezone: string; currency: string; logoUrl: string | null;
  taxRatePct: any; taxLabel: string; invoicePrefix: string;
  laborRateCents: number; defaultPaymentTermsDays: number;
  invoiceNotes: string | null; invoiceTerms: string | null;
  emailNotificationsEnabled: boolean; smsNotificationsEnabled: boolean;
  onlinePaymentsEnabled: boolean; customerPortalEnabled: boolean;
  portalWelcomeMessage: string | null; portalAllowBooking: boolean;
  portalAllowChat: boolean; portalAllowPhotoUpload: boolean;
  portalRequireOtp: boolean; plan: string;
  trialEndsAt: string | null; stripeAccountOnboarded: boolean;
}

interface ProfileData {
  id: string; fullName: string; email: string; phone: string | null;
  avatarUrl: string | null; color: string | null; role: string;
  notifyJobAssigned: boolean; notifyEstimateApproved: boolean;
  notifyInvoicePaid: boolean; notifySmsEnabled: boolean;
}

interface Props {
  org: OrgData;
  profile: ProfileData;
  userRole: string;
}

// ─── Reusable field components ────────────────────────────────────────────────

function Field({ label, error, children, hint }: { label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={cn(
          "w-10 h-6 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-slate-200"
        )}>
          <div className={cn(
            "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-1"
          )} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-8 mb-8 last:border-0 last:mb-0 last:pb-0">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Tab: Business ────────────────────────────────────────────────────────────

function BusinessTab({ org, canEdit }: { org: OrgData; canEdit: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: org.name, phone: org.phone ?? "", email: org.email ?? "",
    website: org.website ?? "", addressLine1: org.addressLine1 ?? "",
    addressLine2: org.addressLine2 ?? "", city: org.city ?? "",
    state: org.state ?? "", zip: org.zip ?? "", country: org.country,
    timezone: org.timezone, currency: org.currency, logoUrl: org.logoUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: "" })); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.details) {
          setErrors(Object.fromEntries(Object.entries(json.error.details).map(([k, v]) => [k, (v as string[])[0]])));
        } else toast({ title: json.error?.message ?? "Failed to save", variant: "destructive" });
        return;
      }
      toast({ title: "Business settings saved" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const TIMEZONES = [
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Toronto",
    "America/Vancouver", "Europe/London", "Europe/Paris", "Australia/Sydney",
  ];

  return (
    <div className="space-y-0">
      <Section title="Shop identity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Business name" error={errors.name}>
            <Input value={form.name} onChange={e => set("name", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Logo URL" hint="Paste a direct image URL" error={errors.logoUrl}>
            <Input value={form.logoUrl} onChange={e => set("logoUrl", e.target.value)} disabled={!canEdit} placeholder="https://…" />
          </Field>
        </div>
      </Section>

      <Section title="Contact information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} disabled={!canEdit} type="tel" />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input value={form.email} onChange={e => set("email", e.target.value)} disabled={!canEdit} type="email" />
          </Field>
          <Field label="Website" error={errors.website}>
            <Input value={form.website} onChange={e => set("website", e.target.value)} disabled={!canEdit} placeholder="https://…" />
          </Field>
        </div>
      </Section>

      <Section title="Address">
        <Field label="Street address" error={errors.addressLine1}>
          <Input value={form.addressLine1} onChange={e => set("addressLine1", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Suite / unit" error={errors.addressLine2}>
          <Input value={form.addressLine2} onChange={e => set("addressLine2", e.target.value)} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="City" error={errors.city}>
            <Input value={form.city} onChange={e => set("city", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="State" error={errors.state}>
            <Input value={form.state} onChange={e => set("state", e.target.value)} disabled={!canEdit} maxLength={2} className="uppercase" />
          </Field>
          <Field label="ZIP" error={errors.zip}>
            <Input value={form.zip} onChange={e => set("zip", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Country" error={errors.country}>
            <Input value={form.country} onChange={e => set("country", e.target.value)} disabled={!canEdit} maxLength={2} className="uppercase" />
          </Field>
        </div>
      </Section>

      <Section title="Locale">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Timezone">
            <Select value={form.timezone} onValueChange={v => set("timezone", v)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onValueChange={v => set("currency", v)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["USD","CAD","EUR","GBP","AUD","NZD","MXN"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      {canEdit && (
        <div className="pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save changes</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Financial ───────────────────────────────────────────────────────────

function FinancialTab({ org, canEdit }: { org: OrgData; canEdit: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    taxRatePct: String(Math.round(Number(org.taxRatePct) * 100 * 100) / 100),
    taxLabel: org.taxLabel,
    invoicePrefix: org.invoicePrefix,
    laborRateCents: String((org.laborRateCents / 100).toFixed(2)),
    defaultPaymentTermsDays: String(org.defaultPaymentTermsDays),
    invoiceNotes: org.invoiceNotes ?? "",
    invoiceTerms: org.invoiceTerms ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxRatePct: parseFloat(form.taxRatePct) || 0,
          taxLabel: form.taxLabel,
          invoicePrefix: form.invoicePrefix,
          laborRateCents: Math.round(parseFloat(form.laborRateCents) * 100) || 0,
          defaultPaymentTermsDays: parseInt(form.defaultPaymentTermsDays) || 30,
          invoiceNotes: form.invoiceNotes || undefined,
          invoiceTerms: form.invoiceTerms || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: "Financial settings saved" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-0">
      <Section title="Rates & tax">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Default labor rate ($/hr)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input className="pl-6" value={form.laborRateCents} onChange={e => set("laborRateCents", e.target.value)} disabled={!canEdit} type="number" min="0" step="0.01" />
            </div>
          </Field>
          <Field label="Tax rate (%)" hint="e.g. 8.25 for 8.25%">
            <div className="relative">
              <Input value={form.taxRatePct} onChange={e => set("taxRatePct", e.target.value)} disabled={!canEdit} type="number" min="0" max="100" step="0.01" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </Field>
          <Field label="Tax label" hint="Shown on invoices">
            <Input value={form.taxLabel} onChange={e => set("taxLabel", e.target.value)} disabled={!canEdit} placeholder="Tax" />
          </Field>
        </div>
      </Section>

      <Section title="Invoice settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Invoice number prefix" hint='Invoices numbered as "INV-1001"'>
            <Input value={form.invoicePrefix} onChange={e => set("invoicePrefix", e.target.value.toUpperCase())} disabled={!canEdit} maxLength={8} />
          </Field>
          <Field label="Default payment terms (days)" hint="0 = due on receipt">
            <Input value={form.defaultPaymentTermsDays} onChange={e => set("defaultPaymentTermsDays", e.target.value)} disabled={!canEdit} type="number" min="0" max="365" />
          </Field>
        </div>
        <Field label="Default invoice notes" hint="Printed on every invoice — thank-you message, warranty info, etc.">
          <Textarea value={form.invoiceNotes} onChange={e => set("invoiceNotes", e.target.value)} disabled={!canEdit} className="min-h-[80px]" placeholder="Thank you for your business!" />
        </Field>
        <Field label="Default terms & conditions" hint="Legal terms shown on invoices">
          <Textarea value={form.invoiceTerms} onChange={e => set("invoiceTerms", e.target.value)} disabled={!canEdit} className="min-h-[80px]" />
        </Field>
      </Section>

      {canEdit && (
        <div className="pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save changes</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab({ org, canEdit }: { org: OrgData; canEdit: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    emailNotificationsEnabled: org.emailNotificationsEnabled,
    smsNotificationsEnabled:   org.smsNotificationsEnabled,
    onlinePaymentsEnabled:     org.onlinePaymentsEnabled,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: "Notification settings saved" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-0">
      <Section title="Communication channels" description="Control how MechanicFlow contacts your customers and staff.">
        <div className="space-y-5">
          <Toggle checked={form.emailNotificationsEnabled}
            onChange={v => setForm(p => ({ ...p, emailNotificationsEnabled: v }))}
            label="Email notifications"
            description="Send appointment reminders, invoice receipts, and estimate approvals by email."
          />
          <Toggle checked={form.smsNotificationsEnabled}
            onChange={v => setForm(p => ({ ...p, smsNotificationsEnabled: v }))}
            label="SMS notifications"
            description="Text message alerts for appointment reminders and job updates. Requires Twilio configuration."
          />
          <Toggle checked={form.onlinePaymentsEnabled}
            onChange={v => setForm(p => ({ ...p, onlinePaymentsEnabled: v }))}
            label="Online payments"
            description="Allow customers to pay invoices online via the customer portal. Requires Stripe Connect setup."
          />
        </div>
      </Section>

      {canEdit && (
        <div className="pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save changes</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Customer Portal ─────────────────────────────────────────────────────

function PortalTab({ org, canEdit }: { org: OrgData; canEdit: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    customerPortalEnabled:  org.customerPortalEnabled,
    portalWelcomeMessage:   org.portalWelcomeMessage ?? "",
    portalAllowBooking:     org.portalAllowBooking,
    portalAllowChat:        org.portalAllowChat,
    portalAllowPhotoUpload: org.portalAllowPhotoUpload,
    portalRequireOtp:       org.portalRequireOtp,
  });
  const [saving, setSaving] = useState(false);
  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/${org.slug}/login`
    : `/portal/${org.slug}/login`;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, portalWelcomeMessage: form.portalWelcomeMessage || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: "Portal settings saved" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-0">
      <Section title="Customer portal" description="Let customers view their vehicles, invoices, and book appointments online.">
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Portal URL</p>
            <p className="text-sm font-mono text-foreground">{portalUrl}</p>
          </div>
          <a href={portalUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline flex-shrink-0">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-5 mt-4">
          <Toggle checked={form.customerPortalEnabled}
            onChange={v => setForm(p => ({ ...p, customerPortalEnabled: v }))}
            label="Enable customer portal"
            description="Customers can log in and view their account, vehicles, and invoices."
          />
          {form.customerPortalEnabled && (
            <>
              <Toggle checked={form.portalAllowBooking}
                onChange={v => setForm(p => ({ ...p, portalAllowBooking: v }))}
                label="Allow online booking"
                description="Customers can request appointments through the portal."
              />
              <Toggle checked={form.portalAllowChat}
                onChange={v => setForm(p => ({ ...p, portalAllowChat: v }))}
                label="Allow messaging"
                description="Customers can send messages to the shop from the portal."
              />
              <Toggle checked={form.portalAllowPhotoUpload}
                onChange={v => setForm(p => ({ ...p, portalAllowPhotoUpload: v }))}
                label="Allow photo uploads"
                description="Customers can upload photos of their vehicle or issue."
              />
              <Toggle checked={form.portalRequireOtp}
                onChange={v => setForm(p => ({ ...p, portalRequireOtp: v }))}
                label="Require OTP login"
                description="Customers log in via a one-time code sent to their email. Recommended for security."
              />
            </>
          )}
        </div>
      </Section>

      {form.customerPortalEnabled && (
        <Section title="Welcome message" description="Shown on the portal dashboard after login.">
          <Textarea
            value={form.portalWelcomeMessage}
            onChange={e => setForm(p => ({ ...p, portalWelcomeMessage: e.target.value }))}
            disabled={!canEdit}
            placeholder="Welcome! View your service history, upcoming appointments, and invoices here."
            className="min-h-[80px]"
          />
        </Section>
      )}

      {canEdit && (
        <div className="pt-2">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save changes</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: My Profile ──────────────────────────────────────────────────────────

function ProfileTab({ profile }: { profile: ProfileData }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: profile.fullName, phone: profile.phone ?? "",
    color: profile.color ?? "#3b82f6",
    notifyJobAssigned:      profile.notifyJobAssigned,
    notifyEstimateApproved: profile.notifyEstimateApproved,
    notifyInvoicePaid:      profile.notifyInvoicePaid,
    notifySmsEnabled:       profile.notifySmsEnabled,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: "Profile saved" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSavingProfile(false); }
  };

  const savePassword = async () => {
    setPwErrors({});
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErrors({ confirmPassword: "Passwords don't match" }); return;
    }
    setSavingPw(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.details) {
          setPwErrors(Object.fromEntries(Object.entries(json.error.details).map(([k, v]) => [k, (v as string[])[0]])));
        } else toast({ title: json.error?.message ?? "Failed", variant: "destructive" });
        return;
      }
      toast({ title: "Password updated — you may need to sign in again on other devices" });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSavingPw(false); }
  };

  const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899","#64748b","#1e293b"];

  return (
    <div className="space-y-0">
      <Section title="Your information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full name">
            <Input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} type="tel" />
          </Field>
        </div>
        <Field label="Email" hint="Contact your admin to change your login email">
          <Input value={profile.email} disabled className="bg-muted/40" />
        </Field>
        <Field label="Calendar color" hint="Your color on the scheduling calendar">
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                className={cn("h-7 w-7 rounded-lg border-2 transition-all",
                  form.color === c ? "border-foreground scale-110" : "border-transparent")}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </Field>
        <Button onClick={saveProfile} disabled={savingProfile} className="gap-2">
          {savingProfile ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save profile</>}
        </Button>
      </Section>

      <Section title="Notification preferences" description="Control what events send you a notification.">
        <div className="space-y-4">
          <Toggle checked={form.notifyJobAssigned}
            onChange={v => setForm(p => ({ ...p, notifyJobAssigned: v }))}
            label="Job assigned to me" />
          <Toggle checked={form.notifyEstimateApproved}
            onChange={v => setForm(p => ({ ...p, notifyEstimateApproved: v }))}
            label="Estimate approved by customer" />
          <Toggle checked={form.notifyInvoicePaid}
            onChange={v => setForm(p => ({ ...p, notifyInvoicePaid: v }))}
            label="Invoice paid" />
          <Toggle checked={form.notifySmsEnabled}
            onChange={v => setForm(p => ({ ...p, notifySmsEnabled: v }))}
            label="Receive SMS notifications" />
        </div>
        <Button onClick={saveProfile} disabled={savingProfile} variant="outline" className="gap-2 mt-4">
          {savingProfile ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save notification prefs"}
        </Button>
      </Section>

      <Section title="Change password">
        <div className="space-y-3 max-w-sm">
          <Field label="Current password" error={pwErrors.currentPassword}>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} value={pwForm.currentPassword}
                onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                className={cn("pr-10", pwErrors.currentPassword && "border-destructive")}
                autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="New password" error={pwErrors.newPassword}>
            <Input type={showPw ? "text" : "password"} value={pwForm.newPassword}
              onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
              className={cn(pwErrors.newPassword && "border-destructive")}
              autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={pwErrors.confirmPassword}>
            <Input type={showPw ? "text" : "password"} value={pwForm.confirmPassword}
              onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
              className={cn(pwErrors.confirmPassword && "border-destructive")}
              autoComplete="new-password" />
          </Field>
          <Button onClick={savePassword} disabled={savingPw || !pwForm.currentPassword || !pwForm.newPassword} className="gap-2">
            {savingPw ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : "Update password"}
          </Button>
        </div>
      </Section>
    </div>
  );
}

// ─── Main Settings Client ─────────────────────────────────────────────────────

const TABS = [
  { id: "business",      label: "Business" },
  { id: "financial",     label: "Financial" },
  { id: "notifications", label: "Notifications" },
  { id: "portal",        label: "Customer Portal" },
  { id: "profile",       label: "My Profile" },
  { id: "billing",       label: "Billing" },
];

export function SettingsClient({ org, profile, userRole }: Props) {
  const [tab, setTab] = useState("business");
  const canEdit = ["OWNER", "MANAGER"].includes(userRole);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
      {/* Tab nav */}
      <div className="flex gap-0 border-b border-border mb-8 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "business"      && <BusinessTab org={org} canEdit={canEdit} />}
      {tab === "financial"     && <FinancialTab org={org} canEdit={canEdit} />}
      {tab === "notifications" && <NotificationsTab org={org} canEdit={canEdit} />}
      {tab === "portal"        && <PortalTab org={org} canEdit={canEdit} />}
      {tab === "profile"       && <ProfileTab profile={profile} />}
      {tab === "billing"       && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground mb-3">Manage your MechanicFlow subscription and payment methods.</p>
          <a href="/settings/billing" className="text-primary text-sm font-medium hover:underline">
            Go to Billing & Payments →
          </a>
        </div>
      )}
    </div>
  );
}
