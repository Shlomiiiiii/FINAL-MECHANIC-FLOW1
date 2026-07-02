"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Zap, AlertTriangle, Clock, User, Car, Wrench,
  Navigation, RefreshCw, Search, ChevronRight, Radio,
  CheckCircle, Circle, Coffee, Phone, MoreHorizontal, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DISPATCH_STATUS_COLORS, DISPATCH_STATUS_LABELS } from "@/lib/dispatch";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Technician {
  id: string;
  fullName: string;
  color: string | null;
  avatarUrl: string | null;
  dispatchStatus: string;
  currentLat: string | null;
  currentLng: string | null;
  locationUpdatedAt: string | null;
  locationAgeMins: number | null;
  hasRecentLocation: boolean;
  activeJobId: string | null;
  skillLevel: string | null;
  specialties: string[];
  jobAssignments: Array<{
    job: {
      id: string; jobNumber: string; title: string; status: string;
      priority: string; isEmergency: boolean;
      serviceAddressLine1: string | null; serviceCity: string | null;
      scheduledAt: string | null; etaMinutes: number | null;
      customer: { firstName: string; lastName: string };
    };
  }>;
}

interface DispatchJob {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  priority: string;
  isEmergency: boolean;
  dispatchScore: number;
  scheduledAt: string | null;
  dispatchedAt: string | null;
  etaMinutes: number | null;
  distanceMiles: string | null;
  customer: { firstName: string; lastName: string; phonePrimary: string | null; addressLine1: string | null; city: string | null };
  vehicle: { year: number | null; make: string | null; model: string | null } | null;
  assignments: Array<{ user: { id: string; fullName: string; color: string | null; dispatchStatus: string } }>;
}

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "text-slate-400", NORMAL: "text-blue-600",
  HIGH: "text-amber-600", URGENT: "text-red-600",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  offline:    Circle,
  available:  CheckCircle,
  dispatched: Navigation,
  traveling:  Navigation,
  on_site:    MapPin,
  on_break:   Coffee,
  busy:       Wrench,
};

function TechCard({ tech, onAssignClick, selectedJobId }: {
  tech: Technician;
  onAssignClick: (techId: string) => void;
  selectedJobId: string | null;
}) {
  const color  = DISPATCH_STATUS_COLORS[tech.dispatchStatus] ?? "#94a3b8";
  const Icon   = STATUS_ICON[tech.dispatchStatus] ?? Circle;
  const activeJob = tech.jobAssignments[0]?.job;

  return (
    <div className={cn("border rounded-xl p-4 bg-card transition-all",
      selectedJobId ? "cursor-pointer hover:border-primary hover:shadow-sm" : "",
      tech.dispatchStatus === "available" ? "border-green-200" : "border-border"
    )}
      onClick={() => selectedJobId && onAssignClick(tech.id)}>

      <div className="flex items-start gap-3 mb-3">
        <div className="relative flex-shrink-0">
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ backgroundColor: tech.color ?? "#64748b" }}>
            {tech.fullName.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background"
            style={{ backgroundColor: color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{tech.fullName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Icon className="h-3 w-3" style={{ color }} />
            <span className="text-xs" style={{ color }}>
              {DISPATCH_STATUS_LABELS[tech.dispatchStatus] ?? tech.dispatchStatus}
            </span>
          </div>
        </div>
        {tech.hasRecentLocation && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
            <Radio className="h-2.5 w-2.5 text-green-500" />
            {tech.locationAgeMins === 0 ? "Now" : `${tech.locationAgeMins}m ago`}
          </div>
        )}
      </div>

      {activeJob && (
        <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
          <p className="font-medium truncate">{activeJob.title}</p>
          <p className="text-muted-foreground truncate">{activeJob.customer.firstName} {activeJob.customer.lastName}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[9px] py-0">{activeJob.status.replace("_"," ")}</Badge>
            {activeJob.etaMinutes && (
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> ETA {activeJob.etaMinutes}m
              </span>
            )}
          </div>
        </div>
      )}

      {tech.skillLevel && (
        <p className="text-[10px] text-muted-foreground mt-2 capitalize">{tech.skillLevel} technician</p>
      )}

      {selectedJobId && tech.dispatchStatus === "available" && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-primary font-medium text-center">Click to assign →</p>
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  isSelected,
  onClick,
  onEmergency,
  onAssign,
  userRole,
}: {
  job: DispatchJob;
  isSelected: boolean;
  onClick: () => void;
  onEmergency: (jobId: string) => void;
  onAssign: (jobId: string) => void;
  userRole: string;
}) {
  const isUnassigned = job.assignments.length === 0;

  return (
    <div className={cn(
      "border rounded-xl p-4 bg-card cursor-pointer transition-all",
      isSelected       ? "border-primary ring-1 ring-primary shadow-sm" :
      job.isEmergency  ? "border-red-300 bg-red-50/50" :
      isUnassigned     ? "border-amber-200" : "border-border",
      "hover:shadow-sm"
    )}
      onClick={onClick}>

      <div className="flex items-start gap-2 mb-2">
        {job.isEmergency && (
          <Zap className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5 animate-pulse" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-mono text-muted-foreground">{job.jobNumber}</span>
            <span className={cn("text-xs font-bold", PRIORITY_COLOR[job.priority])}>
              {job.priority}
            </span>
            <Badge variant="secondary" className="text-[9px] py-0">{job.status.replace("_"," ")}</Badge>
          </div>
          <p className="text-sm font-semibold truncate">{job.title}</p>
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{job.customer.firstName} {job.customer.lastName}</span>
          {job.customer.phonePrimary && (
            <a href={`tel:${job.customer.phonePrimary}`} onClick={e => e.stopPropagation()}
              className="ml-auto text-primary flex-shrink-0">
              <Phone className="h-3 w-3" />
            </a>
          )}
        </div>
        {(job.customer.addressLine1 || job.customer.city) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{job.customer.addressLine1 ?? job.customer.city}</span>
          </div>
        )}
        {job.vehicle && (
          <div className="flex items-center gap-1.5">
            <Car className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{job.vehicle.year} {job.vehicle.make} {job.vehicle.model}</span>
          </div>
        )}
        {job.scheduledAt && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>{new Date(job.scheduledAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</span>
            {job.etaMinutes && <span className="text-green-600">· ETA {job.etaMinutes}m</span>}
          </div>
        )}
      </div>

      {/* Assigned techs */}
      {job.assignments.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {job.assignments.map(a => (
            <span key={a.user.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: (a.user.color ?? "#64748b") + "20", color: a.user.color ?? "#64748b" }}>
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: a.user.color ?? "#64748b" }} />
              {a.user.fullName.split(" ")[0]}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Unassigned
          </span>
        </div>
      )}

      {isSelected && (
        <div className="mt-3 pt-3 border-t border-border flex gap-2">
          {!job.isEmergency && ["OWNER","MANAGER","OFFICE_STAFF"].includes(userRole) && (
            <Button size="sm" variant="outline"
              className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={e => { e.stopPropagation(); onEmergency(job.id); }}>
              <Zap className="h-3 w-3 mr-1" /> Emergency
            </Button>
          )}
          <Button size="sm" className="flex-1 text-xs"
            onClick={e => { e.stopPropagation(); onAssign(job.id); }}>
            <ChevronRight className="h-3 w-3 mr-1" /> Assign tech
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Dispatch Board ──────────────────────────────────────────────────────

export function DispatchBoard({ userRole }: { userRole: string }) {
  const { toast }  = useToast();
  const pollRef    = useRef<NodeJS.Timeout | null>(null);

  const [technicians,   setTechnicians]   = useState<Technician[]>([]);
  const [jobs,          setJobs]          = useState<DispatchJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [isLoading,     setIsLoading]     = useState(true);
  const [isAssigning,   setIsAssigning]   = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [techRes, jobRes] = await Promise.all([
        fetch("/api/dispatch/technicians?includeOffline=true"),
        fetch("/api/dispatch/jobs"),
      ]);
      const [techJson, jobJson] = await Promise.all([techRes.json(), jobRes.json()]);
      if (techRes.ok) setTechnicians(techJson.data.technicians ?? []);
      if (jobRes.ok)  setJobs(jobJson.data.jobs ?? []);
      setLastUpdated(new Date());
    } catch {
      if (!quiet) toast({ title: "Failed to load dispatch data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, []); // no deps — fetch URLs are static, toast is stable enough via closure

  useEffect(() => {
    fetchData();
    // Poll every 30 seconds
    pollRef.current = setInterval(() => fetchData(true), 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  const handleAssign = async (technicianId: string) => {
    if (!selectedJobId) return;
    setIsAssigning(true);
    try {
      const res = await fetch("/api/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId, userId: technicianId, dispatchNow: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Assignment failed", variant: "destructive" }); return; }

      const routeInfo = json.data.routeResult;
      toast({
        title: `Technician assigned${routeInfo ? ` · ETA ${routeInfo.durationMins} min` : ""}`,
      });
      setSelectedJobId(null);
      await fetchData(true);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleEmergency = async (jobId: string) => {
    if (!confirm("Declare this job as EMERGENCY? It will be bumped to the top of the queue and marked URGENT.")) return;
    try {
      const res = await fetch("/api/dispatch/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, autoAssign: false }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: "🚨 Job declared emergency — priority set to URGENT" });
      await fetchData(true);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
  };

  // Filter logic
  const filteredJobs = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      j.title.toLowerCase().includes(q) ||
      j.jobNumber.toLowerCase().includes(q) ||
      `${j.customer.firstName} ${j.customer.lastName}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "unassigned" && j.assignments.length === 0) ||
      (statusFilter === "emergency"  && j.isEmergency) ||
      (statusFilter === "active"     && ["TRAVELING","ON_SITE","IN_PROGRESS"].includes(j.status));
    return matchesSearch && matchesStatus;
  });

  const filteredTechs = technicians.filter(t => {
    const q = search.toLowerCase();
    return !q || t.fullName.toLowerCase().includes(q);
  });

  const available   = technicians.filter(t => t.dispatchStatus === "available").length;
  const onsite      = technicians.filter(t => ["on_site","traveling","dispatched"].includes(t.dispatchStatus)).length;
  const unassigned  = jobs.filter(j => j.assignments.length === 0).length;
  const emergencies = jobs.filter(j => j.isEmergency).length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background flex-shrink-0">
        {/* Status strip */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            {available} available
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            {onsite} on calls
          </span>
          {emergencies > 0 && (
            <span className="flex items-center gap-1.5 text-red-600 font-medium">
              <Zap className="h-3 w-3" /> {emergencies} emergency
            </span>
          )}
          {unassigned > 0 && (
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3 w-3" /> {unassigned} unassigned
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…" className="pl-8 h-8 text-sm" />
        </div>

        {/* Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="emergency">Emergencies</SelectItem>
            <SelectItem value="active">Active</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => fetchData()}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>

        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
          </span>
        )}
      </div>

      {/* Board — two-panel layout */}
      <div className="flex-1 overflow-hidden flex gap-0">
        {/* Left: Job queue */}
        <div className="w-80 xl:w-96 flex-shrink-0 border-r border-border overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between sticky top-0 bg-background pb-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Job queue ({filteredJobs.length})
            </p>
            {selectedJobId && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => setSelectedJobId(null)}>
                Clear
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Wrench className="h-8 w-8 mx-auto mb-2 opacity-20" />
              No jobs in queue
            </div>
          ) : filteredJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              isSelected={selectedJobId === job.id}
              onClick={() => setSelectedJobId(prev => prev === job.id ? null : job.id)}
              onEmergency={handleEmergency}
              onAssign={id => setSelectedJobId(id)}
              userRole={userRole}
            />
          ))}
        </div>

        {/* Right: Technicians */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="sticky top-0 bg-background pb-2 border-b border-border mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Technicians ({filteredTechs.length})
              {selectedJobId && <span className="text-primary ml-2 normal-case font-normal">← Select one to assign</span>}
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredTechs.map(tech => (
                <TechCard
                  key={tech.id}
                  tech={tech}
                  onAssignClick={handleAssign}
                  selectedJobId={selectedJobId}
                />
              ))}
            </div>
          )}

          {isAssigning && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-background rounded-xl p-6 flex items-center gap-3 shadow-xl">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">Dispatching technician…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Google Maps activation banner */}
      {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
        <div className="flex-shrink-0 border-t border-border bg-blue-50 px-4 py-2 flex items-center gap-3">
          <MapPin className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            <strong>Maps not connected.</strong> Add{" "}
            <code className="bg-blue-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            to enable live map, traffic-aware routing, and accurate ETAs.
            ETA estimates currently use straight-line distance calculations.
          </p>
        </div>
      )}
    </div>
  );
}
