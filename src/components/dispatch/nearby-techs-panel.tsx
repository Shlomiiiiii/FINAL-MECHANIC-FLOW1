"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Navigation, User, Clock, Loader2, Zap } from "lucide-react";
import { DISPATCH_STATUS_COLORS, DISPATCH_STATUS_LABELS } from "@/lib/dispatch";
import { cn } from "@/lib/utils";

interface NearbyTech {
  userId: string;
  fullName: string;
  color: string | null;
  dispatchStatus: string;
  distanceMiles: number;
  etaMinutes: number;
  skillLevel: string | null;
}

interface Props {
  jobId: string;
  onAssigned?: () => void;
}

export function NearbyTechsPanel({ jobId, onAssigned }: Props) {
  const { toast } = useToast();
  const [techs,      setTechs]      = useState<NearbyTech[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [fetched,    setFetched]    = useState(false);
  const [mapsEnabled, setMapsEnabled] = useState(false);

  const fetchNearby = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dispatch/nearby?jobId=${jobId}&includeAll=false`);
      const json = await res.json();
      if (res.ok) {
        setTechs(json.data.nearby ?? []);
        setMapsEnabled(json.data.mapsEnabled);
        setFetched(true);
      } else {
        toast({ title: json.error?.message ?? "Failed to find nearby techs", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async (techId: string) => {
    setIsAssigning(techId);
    try {
      const res = await fetch("/api/dispatch/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, userId: techId, dispatchNow: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast({ title: json.error?.message ?? "Failed", variant: "destructive" }); return; }
      toast({ title: `Technician dispatched · ETA ${json.data.routeResult?.durationMins ?? "?"} min` });
      onAssigned?.();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsAssigning(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary" />
          Nearby technicians
          {!mapsEnabled && fetched && (
            <span className="text-[10px] text-muted-foreground font-normal">(Haversine distance)</span>
          )}
        </h3>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5"
          onClick={fetchNearby} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
          {fetched ? "Refresh" : "Find nearby"}
        </Button>
      </div>

      {fetched && techs.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <MapPin className="h-6 w-6 mx-auto mb-2 opacity-30" />
          No available technicians with recent location data within 50 miles.
          <br />
          <span className="text-xs">Techs need to be clocked in and have shared location.</span>
        </div>
      )}

      {techs.map(tech => {
        const statusColor = DISPATCH_STATUS_COLORS[tech.dispatchStatus] ?? "#94a3b8";
        return (
          <div key={tech.userId}
            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: tech.color ?? "#64748b" }}>
              {tech.fullName.split(" ").map(n => n[0]).join("").slice(0,2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tech.fullName}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span style={{ color: statusColor }}>{DISPATCH_STATUS_LABELS[tech.dispatchStatus]}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5" />{tech.distanceMiles.toFixed(1)} mi
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />~{tech.etaMinutes} min ETA
                </span>
              </div>
            </div>
            <Button size="sm" className="h-7 px-2.5 text-xs gap-1 flex-shrink-0"
              disabled={!!isAssigning}
              onClick={() => handleAssign(tech.userId)}>
              {isAssigning === tech.userId
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <><Zap className="h-3 w-3" /> Dispatch</>}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
