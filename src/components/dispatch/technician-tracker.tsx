"use client";

/**
 * Technician GPS tracker — runs on mobile/web for field techs.
 * Sends location pings to /api/dispatch/location every 30 seconds.
 * Auto-stops when clocked out or marked offline.
 */

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Radio, RadioOff, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  userId:        string;
  activeJobId?:  string | null;
  dispatchStatus?: string;
}

export function TechnicianTracker({ userId, activeJobId, dispatchStatus }: Props) {
  const { toast }  = useToast();
  const [isTracking, setIsTracking]   = useState(false);
  const [lastPing,   setLastPing]     = useState<Date | null>(null);
  const [error,      setError]        = useState<string | null>(null);
  const watchRef  = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPos   = useRef<{ lat: number; lng: number } | null>(null);

  const sendPing = async (lat: number, lng: number, accuracy?: number) => {
    try {
      const res = await fetch("/api/dispatch/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat, lng, accuracy,
          jobId: activeJobId,
          source: "web",
        }),
      });
      if (res.ok) {
        setLastPing(new Date());
        setError(null);
      }
    } catch {
      setError("Location sync failed");
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }

    // Get initial position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        setIsTracking(true);
      },
      (err) => setError(`Location denied: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Send pings every 30 seconds
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Only ping if moved at least ~50m (reduce battery drain)
          const moved = !lastPos.current ||
            Math.abs(newPos.lat - lastPos.current.lat) > 0.0005 ||
            Math.abs(newPos.lng - lastPos.current.lng) > 0.0005;
          if (moved) {
            lastPos.current = newPos;
            sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          }
        },
        (err) => setError("Location update failed"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }, 30000);
  };

  const stopTracking = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (intervalRef.current)       clearInterval(intervalRef.current);
    watchRef.current  = null;
    intervalRef.current = null;
    setIsTracking(false);
  };

  // Auto-start when dispatched or traveling
  useEffect(() => {
    const shouldTrack = ["dispatched","traveling","on_site"].includes(dispatchStatus ?? "");
    if (shouldTrack && !isTracking) startTracking();
    if (!shouldTrack && isTracking) stopTracking();
    return () => stopTracking();
  }, [dispatchStatus]);

  if (!isTracking && !error) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-2.5 py-1 rounded-full text-xs",
      isTracking ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    )}>
      {isTracking
        ? <><Radio className="h-3 w-3 animate-pulse" /> Tracking{lastPing ? ` · ${lastPing.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}` : ""}</>
        : <><AlertTriangle className="h-3 w-3" /> {error}</>}
    </div>
  );
}
