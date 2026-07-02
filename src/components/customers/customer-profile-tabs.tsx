"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, FileText, Receipt, Calendar, Car, MessageSquare,
  Clock, CheckCircle, DollarSign, Send, ThumbsUp, ThumbsDown,
  UserPlus, CreditCard, Loader2, Plus, Phone, Mail, StickyNote,
  Users, ArrowRight,
} from "lucide-react";
import { formatCents, formatDate, formatDateTime, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { JobStatus, EstimateStatus, InvoiceStatus } from "@prisma/client";

const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "success" },
  PENDING_REVIEW: { label: "Review", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  INVOICED: { label: "Invoiced", variant: "info" },
  CLOSED: { label: "Closed", variant: "outline" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SENT: { label: "Sent", variant: "info" },
  PARTIALLY_PAID: { label: "Partial", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  OVERDUE: { label: "Overdue", variant: "destructive" },
  VOIDED: { label: "Voided", variant: "outline" },
};

const TIMELINE_ICONS: Record<string, React.ElementType> = {
  customer_created: UserPlus,
  vehicle_added: Car,
  job_created: Wrench,
  job_completed: CheckCircle,
  estimate_created: FileText,
  estimate_sent: Send,
  estimate_approved: ThumbsUp,
  estimate_declined: ThumbsDown,
  invoice_sent: Receipt,
  invoice_paid: DollarSign,
  payment_received: CreditCard,
  appointment_booked: Calendar,
  communication_call: Phone,
  communication_sms: MessageSquare,
  communication_email: Mail,
  communication_in_person: Users,
  communication_note: StickyNote,
};

const TIMELINE_COLORS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-600",
  red: "bg-red-100 text-red-600",
  purple: "bg-purple-100 text-purple-600",
  slate: "bg-slate-100 text-slate-600",
  yellow: "bg-yellow-100 text-yellow-600",
};

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  timestamp: string;
  icon: string;
  color: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  customerId: string;
  jobs: any[];
  estimates: any[];
  invoices: any[];
  appointments: any[];
  vehicles: any[];
  communications: any[];
  timeline: TimelineEvent[];
}

export function CustomerProfileTabs({
  customerId, jobs, estimates, invoices, appointments, vehicles, communications: initialComms, timeline: initialTimeline,
}: Props) {
  const { toast } = useToast();
  const [communications, setCommunications] = useState(initialComms);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [commType, setCommType] = useState("note");
  const [commDirection, setCommDirection] = useState("outbound");
  const [commSubject, setCommSubject] = useState("");
  const [commBody, setCommBody] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  const handleLogComm = async () => {
    if (!commBody.trim()) return;
    setIsLogging(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: commType,
          direction: commType !== "note" ? commDirection : undefined,
          subject: commSubject || undefined,
          body: commBody,
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const newComm = json.data.communication;
      setCommunications((prev) => [newComm, ...prev]);

      // Add to timeline
      const typeLabels: Record<string, string> = {
        call: "Phone call logged", sms: "SMS logged",
        email: "Email logged", in_person: "In-person visit noted", note: "Note added",
      };
      setTimeline((prev) => [{
        id: `comm-${newComm.id}`,
        type: `communication_${commType}`,
        title: typeLabels[commType] ?? "Communication logged",
        subtitle: commSubject || commBody.slice(0, 60),
        timestamp: newComm.createdAt,
        icon: commType === "call" ? "Phone" : commType === "email" ? "Mail" : "MessageSquare",
        color: "slate",
      }, ...prev]);

      setCommBody("");
      setCommSubject("");
      toast({ title: "Communication logged" });
    } catch {
      toast({ title: "Failed to log communication", variant: "destructive" });
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0 gap-0">
        {[
          { value: "overview", label: "Overview" },
          { value: "jobs", label: `Jobs (${jobs.length})` },
          { value: "estimates", label: `Estimates (${estimates.length})` },
          { value: "invoices", label: `Invoices (${invoices.length})` },
          { value: "vehicles", label: `Vehicles (${vehicles.length})` },
          { value: "communications", label: "Communications" },
          { value: "timeline", label: "Timeline" },
        ].map((tab) => (
          <button key={tab.value}
            onClick={(e) => {
              const tabs = e.currentTarget.closest('[role="tablist"]');
              if (tabs) {
                const target = document.querySelector(`[data-tab="${tab.value}"]`);
                target?.click();
              }
            }}
            className="hidden"
          />
        ))}
        <TabsList className="bg-transparent p-0 h-auto gap-0 border-0 w-full justify-start">
          {[
            { value: "overview", label: "Overview" },
            { value: "jobs", label: `Jobs (${jobs.length})` },
            { value: "estimates", label: `Estimates (${estimates.length})` },
            { value: "invoices", label: `Invoices (${invoices.length})` },
            { value: "vehicles", label: `Vehicles (${vehicles.length})` },
            { value: "communications", label: "Communications" },
            { value: "timeline", label: "Timeline" },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </TabsList>

      {/* OVERVIEW */}
      <TabsContent value="overview" className="mt-6 space-y-6">
        {/* Recent jobs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Recent jobs</h3>
            <Link href={`/customers/${customerId}?tab=jobs`} className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {jobs.slice(0, 3).map((job) => {
                const s = JOB_STATUS_CONFIG[job.status as JobStatus];
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <Badge variant={s.variant} className="text-[10px] py-0 flex-shrink-0">{s.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{job.title}</div>
                      <div className="text-xs text-muted-foreground">{job.jobNumber}</div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatCents(job.totalCents)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Recent invoices</h3>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {invoices.slice(0, 3).map((inv) => {
                const s = INVOICE_STATUS_CONFIG[inv.status as InvoiceStatus];
                return (
                  <Link key={inv.id} href={`/invoices/${inv.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <Badge variant={s.variant} className="text-[10px] py-0 flex-shrink-0">{s.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{inv.invoiceNumber}</div>
                      {inv.dueDate && (
                        <div className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{formatCents(inv.totalCents)}</div>
                      {inv.balanceCents > 0 && (
                        <div className="text-xs text-destructive">{formatCents(inv.balanceCents)} due</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </TabsContent>

      {/* JOBS */}
      <TabsContent value="jobs" className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{jobs.length} jobs</h3>
          <Button size="sm" asChild className="gap-1.5">
            <Link href={`/jobs/new?customerId=${customerId}`}>
              <Plus className="h-3.5 w-3.5" /> New job
            </Link>
          </Button>
        </div>
        {jobs.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No jobs yet for this customer.</div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {jobs.map((job) => {
              const s = JOB_STATUS_CONFIG[job.status as JobStatus];
              const tech = job.assignments?.[0]?.user;
              return (
                <Link key={job.id} href={`/jobs/${job.id}`}
                  className="grid grid-cols-[auto_1fr_140px_120px_100px] gap-4 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
                  <Badge variant={s.variant} className="text-[10px] py-0 w-fit">{s.label}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{job.title}</div>
                    <div className="text-xs text-muted-foreground">{job.jobNumber} · {job.vehicle ? `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}` : "No vehicle"}</div>
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{tech?.fullName ?? "Unassigned"}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</span>
                  <span className="text-sm font-semibold tabular-nums text-right">{formatCents(job.totalCents)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* ESTIMATES */}
      <TabsContent value="estimates" className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{estimates.length} estimates</h3>
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <Link href={`/estimates/new?customerId=${customerId}`}>
              <Plus className="h-3.5 w-3.5" /> New estimate
            </Link>
          </Button>
        </div>
        {estimates.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No estimates yet.</div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {estimates.map((est) => (
              <Link key={est.id} href={`/estimates/${est.id}`}
                className="grid grid-cols-[auto_1fr_120px_100px] gap-4 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
                <Badge variant="secondary" className="text-[10px] py-0">{est.status}</Badge>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{est.title}</div>
                  <div className="text-xs text-muted-foreground">{est.estimateNumber}</div>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(est.createdAt)}</span>
                <span className="text-sm font-semibold tabular-nums text-right">{formatCents(est.totalCents)}</span>
              </Link>
            ))}
          </div>
        )}
      </TabsContent>

      {/* INVOICES */}
      <TabsContent value="invoices" className="mt-6">
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {invoices.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No invoices yet.</div>
          ) : invoices.map((inv) => {
            const s = INVOICE_STATUS_CONFIG[inv.status as InvoiceStatus];
            return (
              <Link key={inv.id} href={`/invoices/${inv.id}`}
                className="grid grid-cols-[auto_1fr_120px_130px] gap-4 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors">
                <Badge variant={s.variant} className="text-[10px] py-0">{s.label}</Badge>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{inv.invoiceNumber}</div>
                  {inv.dueDate && <div className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</div>}
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</span>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{formatCents(inv.totalCents)}</div>
                  {inv.balanceCents > 0 && <div className="text-xs text-destructive">{formatCents(inv.balanceCents)} due</div>}
                </div>
              </Link>
            );
          })}
        </div>
      </TabsContent>

      {/* VEHICLES */}
      <TabsContent value="vehicles" className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{vehicles.length} vehicles</h3>
          <Button size="sm" variant="outline" className="gap-1.5" id="add-vehicle-btn">
            <Plus className="h-3.5 w-3.5" /> Add vehicle
          </Button>
        </div>
        <div className="grid gap-3">
          {vehicles.map((v) => (
            <div key={v.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {[v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || "Unknown vehicle"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {[v.color, v.fuelType && `${v.fuelType} engine`, v.licensePlate && `Plate: ${v.licensePlate}`, v.vin && `VIN: ${v.vin}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Car className="h-4 w-4 text-muted-foreground" />
              </div>
              {v.mileageLastSeen && (
                <div className="text-xs text-muted-foreground mt-2">
                  {v.mileageLastSeen.toLocaleString()} mi · last updated {formatDate(v.mileageUpdatedAt ?? v.createdAt)}
                </div>
              )}
            </div>
          ))}
          {vehicles.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">No vehicles on file.</div>
          )}
        </div>
      </TabsContent>

      {/* COMMUNICATIONS */}
      <TabsContent value="communications" className="mt-6 space-y-6">
        {/* Log new */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Log communication</h3>
          <div className="flex gap-3">
            <Select value={commType} onValueChange={setCommType}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="note">📝 Note</SelectItem>
                <SelectItem value="call">📞 Call</SelectItem>
                <SelectItem value="sms">💬 SMS</SelectItem>
                <SelectItem value="email">✉️ Email</SelectItem>
                <SelectItem value="in_person">🤝 In person</SelectItem>
              </SelectContent>
            </Select>
            {commType !== "note" && (
              <Select value={commDirection} onValueChange={setCommDirection}>
                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {commType !== "note" && (
            <input
              placeholder="Subject (optional)"
              value={commSubject}
              onChange={(e) => setCommSubject(e.target.value)}
              className="w-full h-8 px-3 text-sm border border-input rounded-md bg-background"
            />
          )}
          <Textarea
            placeholder={commType === "note" ? "Add a note…" : "What was discussed?"}
            value={commBody}
            onChange={(e) => setCommBody(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleLogComm} disabled={isLogging || !commBody.trim()}>
              {isLogging ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : "Log"}
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="space-y-3">
          {communications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No communications logged yet.</p>
          ) : communications.map((c: any) => {
            const typeIcons: Record<string, React.ElementType> = {
              call: Phone, sms: MessageSquare, email: Mail,
              in_person: Users, note: StickyNote,
            };
            const Icon = typeIcons[c.type] ?? StickyNote;
            return (
              <div key={c.id} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground">
                      {c.user?.fullName ?? "System"}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(c.createdAt)}
                    </span>
                    {c.direction && (
                      <Badge variant="secondary" className="text-[10px] py-0">{c.direction}</Badge>
                    )}
                  </div>
                  {c.subject && <p className="text-xs font-medium text-foreground mb-0.5">{c.subject}</p>}
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </TabsContent>

      {/* TIMELINE */}
      <TabsContent value="timeline" className="mt-6">
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {timeline.map((event) => {
              const Icon = TIMELINE_ICONS[event.type] ?? Clock;
              const colorClass = TIMELINE_COLORS[event.color] ?? TIMELINE_COLORS.slate;
              return (
                <div key={event.id} className="flex gap-4 relative">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 relative z-10", colorClass)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        {event.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5">{event.subtitle}</p>
                        )}
                      </div>
                      <time className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {formatDateTime(new Date(event.timestamp))}
                      </time>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
