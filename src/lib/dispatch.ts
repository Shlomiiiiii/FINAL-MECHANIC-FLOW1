/**
 * MechanicFlow Dispatch Engine
 *
 * Core routing, ETA, and proximity calculations.
 * All math works without a Maps API key (Haversine formula).
 * Google Maps enrichment activates when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
 */

import { prisma } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LatLng { lat: number; lng: number; }

export interface TechnicianDispatchStatus {
  userId:          string;
  fullName:        string;
  color:           string | null;
  avatarUrl:       string | null;
  dispatchStatus:  string;
  position:        LatLng | null;
  locationAge:     number | null;  // minutes since last ping
  activeJobId:     string | null;
  activeJobTitle:  string | null;
  skillLevel:      string | null;
  specialties:     string[];
  distanceMiles?:  number;
  etaMinutes?:     number;
}

export interface JobDispatchView {
  id:           string;
  jobNumber:    string;
  title:        string;
  status:       string;
  priority:     string;
  isEmergency:  boolean;
  customerName: string;
  vehicleLabel: string | null;
  serviceAddress: string | null;
  serviceLocation: LatLng | null;
  scheduledAt:  Date | null;
  assignedTechs: { id: string; fullName: string; color: string | null }[];
  etaMinutes:   number | null;
  distanceMiles: number | null;
  dispatchedAt: Date | null;
}

export interface RouteResult {
  distanceMiles: number;
  durationMins:  number;
  etaAt:         Date;
  hasTrafficData: boolean;
  polyline?:     string;
  via:           "haversine" | "google_maps";
}

// ─── Haversine distance ────────────────────────────────────────────────────────

const EARTH_RADIUS_MILES = 3958.8;

export function haversineDistanceMiles(a: LatLng, b: LatLng): number {
  const R  = EARTH_RADIUS_MILES;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2Lat = Math.sin(dLat / 2) ** 2;
  const sin2Lng = Math.sin(dLng / 2) ** 2;
  const chord = sin2Lat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin2Lng;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function toRad(deg: number): number { return deg * (Math.PI / 180); }

// ─── ETA calculation ──────────────────────────────────────────────────────────

/** Average driving speed assumptions by distance */
function estimateSpeedMph(distanceMiles: number): number {
  if (distanceMiles < 2)  return 20;  // city driving
  if (distanceMiles < 10) return 30;  // mixed
  if (distanceMiles < 30) return 45;  // suburban
  return 55;                          // highway
}

export function estimateETA(
  from: LatLng,
  to: LatLng,
  options?: { averageSpeedMph?: number }
): RouteResult {
  const distanceMiles = haversineDistanceMiles(from, to);
  const speedMph      = options?.averageSpeedMph ?? estimateSpeedMph(distanceMiles);
  const durationMins  = Math.round((distanceMiles / speedMph) * 60);
  const etaAt         = new Date(Date.now() + durationMins * 60 * 1000);
  return { distanceMiles, durationMins, etaAt, hasTrafficData: false, via: "haversine" };
}

// ─── Google Maps ETA (activates when API key is set) ─────────────────────────

export function isGoogleMapsEnabled(): boolean {
  return !!(process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

/**
 * Compute route via Google Maps Directions API.
 * Falls back to Haversine if Maps API unavailable.
 */
export async function computeRoute(
  from: LatLng,
  to: LatLng
): Promise<RouteResult> {
  const fallback = estimateETA(from, to);

  if (!isGoogleMapsEnabled()) return fallback;

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${from.lat},${from.lng}` +
    `&destination=${to.lat},${to.lng}` +
    `&departure_time=now` +
    `&traffic_model=best_guess` +
    `&mode=driving` +
    `&key=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data.status !== "OK" || !data.routes?.[0]) return fallback;

    const leg          = data.routes[0].legs[0];
    const durationSecs = leg.duration_in_traffic?.value ?? leg.duration.value;
    const distanceM    = leg.distance.value;
    const durationMins = Math.round(durationSecs / 60);
    const distanceMiles = distanceM / 1609.344;

    return {
      distanceMiles,
      durationMins,
      etaAt:          new Date(Date.now() + durationSecs * 1000),
      hasTrafficData: !!leg.duration_in_traffic,
      polyline:       data.routes[0].overview_polyline?.points,
      via:            "google_maps",
    };
  } catch {
    return fallback;
  }
}

// ─── Distance Matrix (bulk nearby calculation) ────────────────────────────────

export async function computeDistanceMatrix(
  origin: LatLng,
  destinations: Array<LatLng & { id: string }>
): Promise<Array<{ id: string; distanceMiles: number; durationMins: number }>> {
  if (!isGoogleMapsEnabled() || destinations.length === 0) {
    return destinations.map(dest => ({
      id:            dest.id,
      distanceMiles: haversineDistanceMiles(origin, dest),
      durationMins:  estimateETA(origin, dest).durationMins,
    }));
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const destStr = destinations.map(d => `${d.lat},${d.lng}`).join("|");
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?` +
    `origins=${origin.lat},${origin.lng}` +
    `&destinations=${encodeURIComponent(destStr)}` +
    `&departure_time=now` +
    `&traffic_model=best_guess` +
    `&mode=driving` +
    `&key=${apiKey}`;

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data.status !== "OK") throw new Error(data.status);

    const elements = data.rows[0]?.elements ?? [];
    return destinations.map((dest, i) => {
      const el = elements[i];
      if (!el || el.status !== "OK") {
        return { id: dest.id, ...estimateETA(origin, dest) };
      }
      return {
        id:            dest.id,
        distanceMiles: el.distance.value / 1609.344,
        durationMins:  Math.round((el.duration_in_traffic?.value ?? el.duration.value) / 60),
      };
    });
  } catch {
    return destinations.map(dest => ({
      id:            dest.id,
      distanceMiles: haversineDistanceMiles(origin, dest),
      durationMins:  estimateETA(origin, dest).durationMins,
    }));
  }
}

// ─── Nearest technicians ──────────────────────────────────────────────────────

export interface NearbyTech {
  userId:        string;
  fullName:      string;
  color:         string | null;
  dispatchStatus: string;
  position:      LatLng;
  distanceMiles: number;
  etaMinutes:    number;
  activeJobId:   string | null;
  skillLevel:    string | null;
}

export async function findNearbyTechnicians(
  jobLocation: LatLng,
  organizationId: string,
  options?: { maxDistanceMiles?: number; requiredStatus?: string[]; limit?: number }
): Promise<NearbyTech[]> {
  const maxDist    = options?.maxDistanceMiles ?? 50;
  const statuses   = options?.requiredStatus   ?? ["available", "on_break"];
  const limit      = options?.limit            ?? 10;

  // Get all techs with recent location pings (last 30 minutes)
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const techs = await prisma.user.findMany({
    where: {
      organizationId,
      isActive:        true,
      dispatchStatus:  { in: statuses },
      currentLat:      { not: null },
      currentLng:      { not: null },
      locationUpdatedAt: { gte: cutoff },
    },
    select: {
      id: true, fullName: true, color: true,
      dispatchStatus: true,
      currentLat: true, currentLng: true,
      activeJobId: true, skillLevel: true,
    },
  });

  const withDistance: NearbyTech[] = techs
    .filter(t => t.currentLat && t.currentLng)
    .map(t => {
      const pos = { lat: Number(t.currentLat), lng: Number(t.currentLng) };
      const { distanceMiles, durationMins } = estimateETA(pos, jobLocation);
      return {
        userId:         t.id,
        fullName:       t.fullName,
        color:          t.color,
        dispatchStatus: t.dispatchStatus,
        position:       pos,
        distanceMiles,
        etaMinutes:     durationMins,
        activeJobId:    t.activeJobId,
        skillLevel:     t.skillLevel,
      };
    })
    .filter(t => t.distanceMiles <= maxDist)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);

  return withDistance;
}

// ─── Dispatch event logger ─────────────────────────────────────────────────────

export async function logDispatchEvent(params: {
  organizationId: string;
  eventType:      string;
  jobId?:         string;
  userId?:        string;
  actorId?:       string;
  payload?:       Record<string, unknown>;
  priority?:      string;
}): Promise<void> {
  await prisma.dispatchEvent.create({
    data: {
      organizationId: params.organizationId,
      eventType:      params.eventType,
      jobId:          params.jobId,
      userId:         params.userId,
      actorId:        params.actorId,
      payload:        (params.payload ?? {}) as any,
      priority:       params.priority ?? "normal",
    },
  });
}

// ─── Priority score for dispatch queue sorting ────────────────────────────────

export function getDispatchScore(job: {
  priority: string;
  isEmergency: boolean;
  scheduledAt: Date | null;
  createdAt: Date;
}): number {
  let score = 0;
  if (job.isEmergency)             score += 10000;
  if (job.priority === "URGENT")   score += 1000;
  if (job.priority === "HIGH")     score += 100;
  if (job.priority === "NORMAL")   score += 10;
  if (job.scheduledAt) {
    const minsUntil = (job.scheduledAt.getTime() - Date.now()) / 60000;
    if (minsUntil < 0)    score += 500;  // overdue
    if (minsUntil < 60)   score += 200;  // within 1h
    if (minsUntil < 240)  score += 50;   // within 4h
  }
  return score;
}

export const DISPATCH_STATUS_LABELS: Record<string, string> = {
  offline:    "Offline",
  available:  "Available",
  dispatched: "Dispatched",
  traveling:  "Traveling",
  on_site:    "On Site",
  on_break:   "On Break",
  busy:       "Busy",
};

export const DISPATCH_STATUS_COLORS: Record<string, string> = {
  offline:    "#94a3b8",
  available:  "#22c55e",
  dispatched: "#3b82f6",
  traveling:  "#f59e0b",
  on_site:    "#f97316",
  on_break:   "#a78bfa",
  busy:       "#ef4444",
};
