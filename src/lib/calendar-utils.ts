/**
 * Calendar utilities — no external dependencies.
 * All date math uses native JS Date.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarView = "day" | "week" | "month" | "agenda";

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  color?: string;
  technicianId?: string | null;
  technicianName?: string;
  customerId?: string;
  customerName?: string;
  vehicleLabel?: string;
  status: string;
  appointmentType: string;
  priority: string;
  locationType: string;
  locationAddress?: string | null;
  jobId?: string | null;
  isWaitlisted?: boolean;
  isRecurring?: boolean;
}

export interface TimeSlot {
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  technicianId?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{ id: string; title: string; startsAt: Date; endsAt: Date }>;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfWeek(date: Date, weekStartsOn = 0): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date, weekStartsOn = 0): Date {
  const start = startOfWeek(date, weekStartsOn);
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

export function differenceInMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function getCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = getDaysInMonth(year, month);
  const totalDays = daysInMonth + startOffset;
  const numWeeks = Math.ceil(totalDays / 7);

  return Array.from({ length: numWeeks }, (_, weekIdx) =>
    Array.from({ length: 7 }, (_, dayIdx) => {
      const dayNumber = weekIdx * 7 + dayIdx - startOffset + 1;
      return new Date(year, month, dayNumber);
    })
  );
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  const min  = m.toString().padStart(2, "0");
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${min} ${ampm}`;
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDate(date: Date, opts?: { short?: boolean }): string {
  const options: Intl.DateTimeFormatOptions = opts?.short
    ? { month: "short", day: "numeric" }
    : { weekday: "long", month: "long", day: "numeric", year: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

export function formatWeekHeader(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.toLocaleDateString("en-US", { month: "long" })} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Hour slots ───────────────────────────────────────────────────────────────

export function getHourSlots(startHour = 6, endHour = 21): number[] {
  return Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
}

export function getTopPercent(date: Date, startHour = 6): number {
  const totalMinutes = (date.getHours() - startHour) * 60 + date.getMinutes();
  const totalSlotMinutes = (21 - startHour) * 60;
  return Math.max(0, Math.min(100, (totalMinutes / totalSlotMinutes) * 100));
}

export function getHeightPercent(start: Date, end: Date, startHour = 6): number {
  const totalSlotMinutes = (21 - startHour) * 60;
  const durationMinutes = Math.max(30, differenceInMinutes(end, start));
  return Math.min(100, (durationMinutes / totalSlotMinutes) * 100);
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export function eventsOverlap(
  aStart: Date, aEnd: Date,
  bStart: Date, bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ─── Event color ──────────────────────────────────────────────────────────────

export const APPOINTMENT_TYPE_COLORS: Record<string, string> = {
  service:    "#3b82f6",
  estimate:   "#8b5cf6",
  pickup:     "#f59e0b",
  delivery:   "#10b981",
  inspection: "#06b6d4",
  emergency:  "#ef4444",
  follow_up:  "#64748b",
};

export const STATUS_COLORS: Record<string, string> = {
  SCHEDULED:   "#3b82f6",
  CONFIRMED:   "#10b981",
  IN_PROGRESS: "#f59e0b",
  COMPLETED:   "#64748b",
  CANCELLED:   "#ef4444",
  NO_SHOW:     "#9f1239",
  WAITLISTED:  "#a78bfa",
  RESCHEDULED: "#f97316",
};

export const PRIORITY_COLORS: Record<string, string> = {
  low:       "#94a3b8",
  normal:    "#3b82f6",
  high:      "#f97316",
  emergency: "#ef4444",
};

export function getEventColor(event: CalendarEvent): string {
  if (event.color) return event.color;
  if (event.priority === "emergency") return PRIORITY_COLORS.emergency;
  return APPOINTMENT_TYPE_COLORS[event.appointmentType] ?? "#3b82f6";
}

// ─── Google Calendar (architecture-ready) ────────────────────────────────────

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * Build a Google Calendar event from an appointment.
 * Called when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.
 */
export function buildGoogleCalendarEvent(event: CalendarEvent) {
  return {
    summary: event.title,
    description: [
      event.customerName && `Customer: ${event.customerName}`,
      event.vehicleLabel && `Vehicle: ${event.vehicleLabel}`,
      event.locationAddress && `Location: ${event.locationAddress}`,
    ].filter(Boolean).join("\n"),
    start: {
      dateTime: event.startsAt.toISOString(),
      timeZone: "America/New_York",
    },
    end: {
      dateTime: event.endsAt.toISOString(),
      timeZone: "America/New_York",
    },
    colorId: event.priority === "emergency" ? "11" : "1",
    status: event.status === "CANCELLED" ? "cancelled" : "confirmed",
  };
}

export function isGoogleCalendarEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
