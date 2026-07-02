"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Clock, Coffee, LogIn, LogOut, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClockStatus {
  isClockedIn: boolean;
  onBreak: boolean;
  entry: any;
  minutesSinceClockIn: number;
}

export function ClockWidget({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [status, setStatus]   = useState<ClockStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing]   = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchStatus();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (status?.isClockedIn) {
      setElapsed(status.minutesSinceClockIn);
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 60000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/team/clock/status");
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data);
      }
    } catch {} finally { setIsLoading(false); }
  };

  const getLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const performAction = async (action: string) => {
    setIsActing(true);
    try {
      const loc = await getLocation();
      const res = await fetch(`/api/team/${userId}/clock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lat: loc?.lat, lng: loc?.lng }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error?.message ?? "Action failed", variant: "destructive" });
        return;
      }
      await fetchStatus();
      const labels: Record<string, string> = {
        clock_in:    "Clocked in",
        clock_out:   "Clocked out",
        break_start: "Break started",
        break_end:   "Break ended",
      };
      toast({ title: labels[action] ?? "Done" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsActing(false);
    }
  };

  const formatElapsed = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted animate-pulse">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const isClockedIn = status?.isClockedIn ?? false;
  const onBreak     = status?.onBreak ?? false;

  return (
    <div className="flex items-center gap-2">
      {/* Status indicator */}
      <div className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        isClockedIn && !onBreak ? "bg-green-100 text-green-700" :
        isClockedIn && onBreak  ? "bg-amber-100 text-amber-700" :
        "bg-muted text-muted-foreground"
      )}>
        <div className={cn("h-1.5 w-1.5 rounded-full",
          isClockedIn && !onBreak ? "bg-green-500 animate-pulse" :
          isClockedIn && onBreak  ? "bg-amber-500" :
          "bg-muted-foreground"
        )} />
        {isClockedIn ? (onBreak ? `Break · ${formatElapsed(elapsed)}` : formatElapsed(elapsed)) : "Clocked out"}
      </div>

      {/* Action button */}
      <Button
        size="sm"
        variant={isClockedIn ? "outline" : "default"}
        disabled={isActing}
        className="h-7 px-2.5 gap-1.5 text-xs"
        onClick={() => {
          if (!isClockedIn) performAction("clock_in");
          else if (onBreak)  performAction("break_end");
          else               performAction("break_start");
        }}
      >
        {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> :
         !isClockedIn ? <><LogIn className="h-3 w-3" /> Clock in</> :
         onBreak     ? <><Coffee className="h-3 w-3" /> End break</> :
                       <><Coffee className="h-3 w-3" /> Break</>}
      </Button>

      {isClockedIn && (
        <Button
          size="sm"
          variant="outline"
          disabled={isActing}
          className="h-7 px-2.5 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => performAction("clock_out")}
        >
          {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LogOut className="h-3 w-3" /> Clock out</>}
        </Button>
      )}
    </div>
  );
}
