"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Technician { id: string; fullName: string; color: string | null; role: string; }
interface Customer { id: string; firstName: string; lastName: string; phonePrimary: string | null; }
interface Vehicle { id: string; year: number | null; make: string | null; model: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (appt: any) => void;
  technicians: Technician[];
  defaultStartsAt?: Date;
  defaultTechnicianId?: string;
  editAppointment?: any;
}

const APPT_TYPES = [
  { value: "service",    label: "Service" },
  { value: "estimate",   label: "Estimate" },
  { value: "pickup",     label: "Pickup" },
  { value: "delivery",   label: "Delivery" },
  { value: "inspection", label: "Inspection" },
  { value: "emergency",  label: "🚨 Emergency" },
  { value: "follow_up",  label: "Follow-up" },
];

const PRIORITIES = [
  { value: "low",       label: "Low" },
  { value: "normal",    label: "Normal" },
  { value: "high",      label: "High" },
  { value: "emergency", label: "Emergency" },
];

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AppointmentDialog({ open, onClose, onSaved, technicians, defaultStartsAt, defaultTechnicianId, editAppointment }: Props) {
  const { toast } = useToast();
  const isEdit = !!editAppointment;

  const defaultStart = defaultStartsAt ?? new Date();
  const defaultEnd   = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  const [form, setForm] = useState({
    customerId:     editAppointment?.customerId    ?? "",
    vehicleId:      editAppointment?.vehicleId     ?? "",
    technicianId:   editAppointment?.technicianId  ?? defaultTechnicianId ?? "",
    title:          editAppointment?.title         ?? "",
    description:    editAppointment?.description   ?? "",
    appointmentType: editAppointment?.appointmentType ?? "service",
    priority:       editAppointment?.priority      ?? "normal",
    startsAt:       editAppointment?.startsAt ? toLocalInput(new Date(editAppointment.startsAt)) : toLocalInput(defaultStart),
    endsAt:         editAppointment?.endsAt   ? toLocalInput(new Date(editAppointment.endsAt))   : toLocalInput(defaultEnd),
    locationType:   editAppointment?.locationType  ?? "shop",
    locationAddress: editAppointment?.locationAddress ?? "",
    notes:          editAppointment?.notes         ?? "",
    internalNotes:  editAppointment?.internalNotes ?? "",
  });

  const [isLoading,     setIsLoading]     = useState(false);
  const [customerSearch, setCustomerSearch] = useState(editAppointment?.customer ? `${editAppointment.customer.firstName} ${editAppointment.customer.lastName}` : "");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [vehicles,       setVehicles]       = useState<Vehicle[]>([]);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [errors,         setErrors]         = useState<Record<string, string>>({});

  const set = (k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  // Customer search
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`);
        if (res.ok) {
          const json = await res.json();
          setCustomerResults(json.data.results.filter((r: any) => r.type === "customer").slice(0, 6));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // Load vehicles when customer changes
  useEffect(() => {
    if (!form.customerId) { setVehicles([]); return; }
    fetch(`/api/customers/${form.customerId}/vehicles`).then((r) => r.json()).then((j) => {
      setVehicles(j.data?.vehicles ?? []);
    }).catch(() => {});
  }, [form.customerId]);

  // Conflict check
  useEffect(() => {
    if (!form.technicianId || !form.startsAt || !form.endsAt) { setConflictWarning(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/appointments?from=${new Date(form.startsAt).toISOString()}&to=${new Date(form.endsAt).toISOString()}&technicianId=${form.technicianId}`
        );
        if (res.ok) {
          const json = await res.json();
          const conflicts = (json.data?.appointments ?? []).filter(
            (a: any) => a.id !== editAppointment?.id && !["CANCELLED","NO_SHOW"].includes(a.status)
          );
          setConflictWarning(conflicts.length > 0 ? `⚠️ Conflict with "${conflicts[0].title}"` : null);
        }
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [form.technicianId, form.startsAt, form.endsAt, editAppointment?.id]);

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = "Customer is required";
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.startsAt)    errs.startsAt = "Start time is required";
    if (!form.endsAt)      errs.endsAt   = "End time is required";
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setIsLoading(true);
    try {
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt:   new Date(form.endsAt).toISOString(),
        technicianId:  form.technicianId  || undefined,
        vehicleId:     form.vehicleId     || undefined,
        locationAddress: form.locationAddress || undefined,
        description:   form.description   || undefined,
        notes:         form.notes         || undefined,
        internalNotes: form.internalNotes || undefined,
      };

      const url    = isEdit ? `/api/appointments/${editAppointment.id}` : "/api/appointments";
      const method = isEdit ? "PATCH" : "POST";

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();

      if (!res.ok) {
        const serverErrors = json.error?.details ?? {};
        if (Object.keys(serverErrors).length > 0) {
          const mapped: Record<string,string> = {};
          for (const [k, v] of Object.entries(serverErrors)) mapped[k] = (v as string[])[0];
          setErrors(mapped);
        } else {
          toast({ title: json.error?.message ?? "Failed to save", variant: "destructive" });
        }
        return;
      }

      toast({ title: isEdit ? "Appointment updated" : "Appointment created" });
      onSaved(json.data.appointment);
      onClose();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit appointment" : "New appointment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label>Customer <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className={cn("pl-9", errors.customerId && "border-destructive")}
                placeholder="Search customer…"
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); if (!e.target.value) { set("customerId", ""); setVehicles([]); } }}
              />
            </div>
            {customerResults.length > 0 && (
              <div className="rounded-lg border border-border bg-background shadow-sm overflow-hidden">
                {customerResults.map((c: any) => (
                  <button key={c.id} type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => { set("customerId", c.customerId ?? c.id); setCustomerSearch(c.label); setCustomerResults([]); }}>
                    <span className="font-medium">{c.label}</span>
                    {c.sublabel && <span className="text-muted-foreground ml-2">{c.sublabel}</span>}
                  </button>
                ))}
              </div>
            )}
            {errors.customerId && <p className="text-xs text-destructive">{errors.customerId}</p>}
          </div>

          {/* Vehicle */}
          {vehicles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={form.vehicleId} onValueChange={(v) => set("vehicleId", v)}>
                <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Oil change + tire rotation"
              className={cn(errors.title && "border-destructive")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.appointmentType} onValueChange={(v) => set("appointmentType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger className={cn(form.priority === "emergency" && "border-destructive text-destructive")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start time <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)}
                className={cn(errors.startsAt && "border-destructive")} />
            </div>
            <div className="space-y-1.5">
              <Label>End time <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)}
                className={cn(errors.endsAt && "border-destructive")} />
            </div>
          </div>

          {/* Technician */}
          <div className="space-y-1.5">
            <Label>Technician</Label>
            <Select value={form.technicianId} onValueChange={(v) => set("technicianId", v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      {t.color && <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
                      {t.fullName}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conflictWarning && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {conflictWarning}
              </div>
            )}
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>Location</Label>
            <div className="flex gap-2">
              <Select value={form.locationType} onValueChange={(v) => set("locationType", v)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shop">At shop</SelectItem>
                  <SelectItem value="mobile">Mobile service</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="dropoff">Drop-off</SelectItem>
                </SelectContent>
              </Select>
              {form.locationType !== "shop" && (
                <Input placeholder="Customer address…" value={form.locationAddress}
                  onChange={(e) => set("locationAddress", e.target.value)} className="flex-1" />
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Customer notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Notes visible to customer…" className="min-h-[60px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Internal notes</Label>
            <Textarea value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)}
              placeholder="Internal notes (not visible to customer)…" className="min-h-[60px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading} className="min-w-28">
            {isLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              : isEdit ? "Save changes" : "Create appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
