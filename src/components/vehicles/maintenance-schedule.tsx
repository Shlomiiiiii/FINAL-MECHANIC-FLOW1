"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle, Clock, Plus, Loader2,
  Droplets, Disc3, Zap, Wind, BatteryMedium, Circle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Reminder {
  id: string;
  serviceType: string;
  name: string;
  notes: string | null;
  intervalMiles: number | null;
  intervalMonths: number | null;
  lastCompletedAt: string | null;
  lastCompletedMiles: number | null;
  dueMiles: number | null;
  dueDate: string | null;
  isActive: boolean;
  _status: "overdue" | "due_soon" | "ok" | "unknown";
}

interface Props {
  vehicleId: string;
  initialReminders: Reminder[];
  currentMileage?: number | null;
}

const SERVICE_TYPES = [
  { value: "oil_change", label: "Oil Change", icon: Droplets },
  { value: "brakes", label: "Brakes", icon: Disc3 },
  { value: "transmission", label: "Transmission Service", icon: Circle },
  { value: "coolant", label: "Coolant Flush", icon: Droplets },
  { value: "spark_plugs", label: "Spark Plugs", icon: Zap },
  { value: "air_filter", label: "Air Filter", icon: Wind },
  { value: "cabin_filter", label: "Cabin Air Filter", icon: Wind },
  { value: "battery", label: "Battery", icon: BatteryMedium },
  { value: "tires", label: "Tires / Rotation", icon: Circle },
  { value: "timing_belt", label: "Timing Belt", icon: Circle },
  { value: "serpentine_belt", label: "Serpentine Belt", icon: Circle },
  { value: "fuel_filter", label: "Fuel Filter", icon: Droplets },
  { value: "power_steering", label: "Power Steering Fluid", icon: Droplets },
  { value: "custom", label: "Custom Reminder", icon: Clock },
];

const STATUS_CONFIG = {
  overdue: { label: "Overdue", variant: "destructive" as const, icon: AlertTriangle, color: "text-destructive" },
  due_soon: { label: "Due soon", variant: "warning" as const, icon: Clock, color: "text-warning" },
  ok: { label: "OK", variant: "success" as const, icon: CheckCircle, color: "text-success" },
  unknown: { label: "No data", variant: "secondary" as const, icon: Clock, color: "text-muted-foreground" },
};

export function MaintenanceSchedule({ vehicleId, initialReminders, currentMileage }: Props) {
  const { toast } = useToast();
  const [reminders, setReminders] = useState(initialReminders);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newReminder, setNewReminder] = useState({
    serviceType: "oil_change",
    name: "Oil Change",
    notes: "",
    intervalMiles: "",
    intervalMonths: "",
    dueDate: "",
    dueMiles: "",
  });

  const handleServiceTypeChange = (type: string) => {
    const st = SERVICE_TYPES.find((s) => s.value === type);
    setNewReminder((p) => ({ ...p, serviceType: type, name: st?.label ?? "" }));
  };

  const handleAdd = async () => {
    if (!newReminder.name.trim()) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        serviceType: newReminder.serviceType,
        name: newReminder.name.trim(),
        notes: newReminder.notes || undefined,
        intervalMiles: newReminder.intervalMiles ? parseInt(newReminder.intervalMiles) : undefined,
        intervalMonths: newReminder.intervalMonths ? parseInt(newReminder.intervalMonths) : undefined,
        dueDate: newReminder.dueDate || undefined,
        dueMiles: newReminder.dueMiles ? parseInt(newReminder.dueMiles) : undefined,
      };

      const res = await fetch(`/api/vehicles/${vehicleId}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed to add reminder", variant: "destructive" }); return; }

      setReminders((p) => [{ ...json.data.reminder, _status: "unknown" }, ...p]);
      setIsDialogOpen(false);
      setNewReminder({ serviceType: "oil_change", name: "Oil Change", notes: "", intervalMiles: "", intervalMonths: "", dueDate: "", dueMiles: "" });
      toast({ title: "Reminder added" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (reminder: Reminder) => {
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/maintenance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderId: reminder.id, isActive: !reminder.isActive }),
      });
      if (!res.ok) { toast({ title: "Failed to update", variant: "destructive" }); return; }
      setReminders((p) => p.map((r) => r.id === reminder.id ? { ...r, isActive: !r.isActive } : r));
    } catch { toast({ title: "Network error", variant: "destructive" }); }
  };

  const overdue = reminders.filter((r) => r._status === "overdue" && r.isActive);
  const dueSoon = reminders.filter((r) => r._status === "due_soon" && r.isActive);
  const ok = reminders.filter((r) => (r._status === "ok" || r._status === "unknown") && r.isActive);
  const inactive = reminders.filter((r) => !r.isActive);

  const ReminderRow = ({ r }: { r: Reminder }) => {
    const status = STATUS_CONFIG[r._status];
    const Icon = status.icon;
    const serviceType = SERVICE_TYPES.find((s) => s.value === r.serviceType);
    const ServiceIcon = serviceType?.icon ?? Clock;

    return (
      <div className={cn("flex items-start gap-4 p-4 rounded-lg border transition-colors",
        r._status === "overdue" ? "border-destructive/30 bg-destructive/5" :
        r._status === "due_soon" ? "border-warning/30 bg-warning/5" :
        "border-border bg-card"
      )}>
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <ServiceIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{r.name}</span>
            <Badge variant={status.variant} className="text-[10px] py-0 gap-1">
              <Icon className="h-2.5 w-2.5" />
              {status.label}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {r.dueMiles && (
              <span>Due at {r.dueMiles.toLocaleString()} mi
                {currentMileage ? ` (${(r.dueMiles - currentMileage).toLocaleString()} remaining)` : ""}
              </span>
            )}
            {r.dueDate && <span>Due {formatDate(r.dueDate)}</span>}
            {r.intervalMiles && <span>Every {r.intervalMiles.toLocaleString()} mi</span>}
            {r.intervalMonths && <span>Every {r.intervalMonths} months</span>}
            {r.lastCompletedAt && <span>Last done {formatDate(r.lastCompletedAt)}</span>}
          </div>
          {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
        </div>
        <button onClick={() => handleToggle(r)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          {r.isActive ? "Disable" : "Enable"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Maintenance reminders</h3>
        <Button size="sm" className="gap-1.5" onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add reminder
        </Button>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Overdue ({overdue.length})</p>
          {overdue.map((r) => <ReminderRow key={r.id} r={r} />)}
        </div>
      )}

      {/* Due soon */}
      {dueSoon.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-warning uppercase tracking-wide">Due soon ({dueSoon.length})</p>
          {dueSoon.map((r) => <ReminderRow key={r.id} r={r} />)}
        </div>
      )}

      {/* OK */}
      {ok.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Up to date ({ok.length})</p>
          {ok.map((r) => <ReminderRow key={r.id} r={r} />)}
        </div>
      )}

      {reminders.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No maintenance reminders set up. Add one to track service intervals.
        </div>
      )}

      {/* Inactive */}
      {inactive.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {inactive.length} disabled reminder{inactive.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-2 mt-2 opacity-50">
            {inactive.map((r) => <ReminderRow key={r.id} r={r} />)}
          </div>
        </details>
      )}

      {/* Add reminder dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add maintenance reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Service type</Label>
              <Select value={newReminder.serviceType} onValueChange={handleServiceTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {SERVICE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rName">Name</Label>
              <Input id="rName" value={newReminder.name} onChange={(e) => setNewReminder((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Synthetic Oil Change" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rMi">Every (miles)</Label>
                <Input id="rMi" type="number" value={newReminder.intervalMiles} onChange={(e) => setNewReminder((p) => ({ ...p, intervalMiles: e.target.value }))} placeholder="5,000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rMo">Every (months)</Label>
                <Input id="rMo" type="number" value={newReminder.intervalMonths} onChange={(e) => setNewReminder((p) => ({ ...p, intervalMonths: e.target.value }))} placeholder="6" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rDueMi">Due at miles</Label>
                <Input id="rDueMi" type="number" value={newReminder.dueMiles} onChange={(e) => setNewReminder((p) => ({ ...p, dueMiles: e.target.value }))} placeholder="73,000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rDueDate">Due date</Label>
                <Input id="rDueDate" type="date" value={newReminder.dueDate} onChange={(e) => setNewReminder((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rNotes">Notes</Label>
              <Textarea id="rNotes" value={newReminder.notes} onChange={(e) => setNewReminder((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isSaving || !newReminder.name.trim()}>
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : "Add reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
