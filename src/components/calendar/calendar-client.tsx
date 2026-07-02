"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppointmentDialog } from "./appointment-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays,
  LayoutList, Grid3X3, Clock, MapPin, AlertTriangle,
  User, Wrench, Car, RefreshCw,
} from "lucide-react";
import {
  type CalendarView, type CalendarEvent,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfDay, endOfDay, addDays, isSameDay, getWeekDays,
  getCalendarWeeks, formatTime, formatTimeRange, formatDate,
  formatWeekHeader, formatMonthYear, formatDayHeader,
  getHourSlots, getTopPercent, getHeightPercent,
  getEventColor, STATUS_COLORS, APPOINTMENT_TYPE_COLORS,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";

interface Technician { id: string; fullName: string; color: string | null; role: string; }

interface Props {
  technicians: Technician[];
  initialView?: CalendarView;
  userRole: string;
  userId: string;
}

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const HOUR_START = 6;
const HOUR_END   = 21;

function EventChip({ event, onClick, compact = false }: { event: CalendarEvent; onClick: (e: CalendarEvent) => void; compact?: boolean }) {
  const color = getEventColor(event);
  return (
    <button
      onClick={(ev) => { ev.stopPropagation(); onClick(event); }}
      className={cn(
        "w-full text-left rounded overflow-hidden transition-opacity hover:opacity-80",
        compact ? "px-1.5 py-0.5" : "px-2 py-1"
      )}
      style={{ backgroundColor: color + "20", borderLeft: `3px solid ${color}` }}
    >
      <p className={cn("font-medium truncate leading-tight", compact ? "text-[10px]" : "text-xs")}
         style={{ color }}>
        {!compact && formatTime(event.startsAt) + " "}{event.title}
      </p>
      {!compact && event.technicianName && (
        <p className="text-[10px] text-muted-foreground truncate">{event.technicianName}</p>
      )}
    </button>
  );
}

export function CalendarClient({ technicians, initialView = "week", userRole, userId }: Props) {
  const { toast } = useToast();
  const [view,        setView]        = useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events,      setEvents]      = useState<CalendarEvent[]>([]);
  const [timeOff,     setTimeOff]     = useState<any[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [filterTech,  setFilterTech]  = useState<string>("all");
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editAppt,    setEditAppt]    = useState<any | null>(null);
  const [clickedSlot, setClickedSlot] = useState<{ startsAt: Date; technicianId?: string } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Compute date range as stable ISO strings — Date objects are always new references
  // and would cause fetchEvents to re-create on every render, triggering an infinite loop.
  const { rangeStartISO, rangeEndISO } = useMemo(() => {
    let rangeStart: Date;
    let rangeEnd: Date;
    if (view === "day") {
      rangeStart = startOfDay(currentDate);
      rangeEnd   = endOfDay(currentDate);
    } else if (view === "week") {
      rangeStart = startOfWeek(currentDate, 0);
      rangeEnd   = endOfWeek(currentDate, 0);
    } else if (view === "month") {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      rangeStart = addDays(ms, -ms.getDay());
      rangeEnd   = addDays(me, 6 - me.getDay());
    } else {
      // agenda: 30 days
      rangeStart = startOfDay(currentDate);
      rangeEnd   = addDays(currentDate, 30);
    }
    return { rangeStartISO: rangeStart.toISOString(), rangeEndISO: rangeEnd.toISOString() };
  }, [view, currentDate.toDateString()]); // toDateString() is stable across same-day re-renders

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({
        from: rangeStartISO,
        to:   rangeEndISO,
        ...(filterTech !== "all" ? { technicianId: filterTech } : {}),
      });
      const res = await fetch(`/api/appointments?${qs}`);
      if (!res.ok) throw new Error();
      const json = await res.json();

      const mapped: CalendarEvent[] = (json.data.appointments ?? []).map((a: any) => ({
        id:              a.id,
        title:           a.title,
        startsAt:        new Date(a.startsAt),
        endsAt:          new Date(a.endsAt),
        allDay:          a.allDay,
        color:           a.color ?? a.technician?.color,
        technicianId:    a.technicianId,
        technicianName:  a.technician?.fullName,
        customerId:      a.customerId,
        customerName:    a.customer ? `${a.customer.firstName} ${a.customer.lastName}` : undefined,
        vehicleLabel:    a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : undefined,
        status:          a.status,
        appointmentType: a.appointmentType,
        priority:        a.priority,
        locationType:    a.locationType,
        locationAddress: a.locationAddress,
        jobId:           a.jobId,
        isWaitlisted:    a.isWaitlisted,
        isRecurring:     a.isRecurring,
      }));

      setEvents(mapped);
      setTimeOff(json.data.timeOff ?? []);
    } catch {
      toast({ title: "Failed to load calendar", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [rangeStartISO, rangeEndISO, filterTech]); // toast is stable, omit to avoid stale closure issues

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (view === "day")    d.setDate(d.getDate() + dir);
    if (view === "week")   d.setDate(d.getDate() + 7 * dir);
    if (view === "month")  d.setMonth(d.getMonth() + dir);
    if (view === "agenda") d.setDate(d.getDate() + 30 * dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const eventsOnDay = (day: Date) =>
    events.filter((e) => isSameDay(e.startsAt, day) || (e.allDay && e.startsAt <= day && e.endsAt >= day));

  const eventsInRange = (start: Date, end: Date) =>
    events.filter((e) => e.startsAt >= start && e.startsAt < end);

  const handleSlotClick = (startsAt: Date, technicianId?: string) => {
    setClickedSlot({ startsAt, technicianId });
    setEditAppt(null);
    setDialogOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleSaved = (appt: any) => {
    setDialogOpen(false);
    setEditAppt(null);
    setClickedSlot(null);
    fetchEvents();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Cancel this appointment?")) return;
    try {
      const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Appointment cancelled" });
      setSelectedEvent(null);
      fetchEvents();
    } catch {
      toast({ title: "Failed to cancel", variant: "destructive" });
    }
  };

  const headerTitle = view === "day" ? formatDayHeader(currentDate)
    : view === "week"  ? formatWeekHeader(startOfWeek(currentDate, 0))
    : view === "month" ? formatMonthYear(currentDate)
    : `Next 30 days from ${formatDate(currentDate, { short: true })}`;

  // ─── Week/Day grid ────────────────────────────────────────────────────────
  const renderTimeGrid = (days: Date[]) => {
    const hours = getHourSlots(HOUR_START, HOUR_END);
    const totalMins = (HOUR_END - HOUR_START) * 60;

    return (
      <div className="flex flex-1 overflow-auto">
        {/* Time gutter */}
        <div className="w-14 flex-shrink-0 border-r border-border">
          <div className="h-12 border-b border-border" /> {/* header spacer */}
          <div className="relative" style={{ height: `${totalMins * 1.5}px` }}>
            {hours.map((h) => (
              <div key={h} className="absolute w-full flex items-start px-2"
                style={{ top: `${((h - HOUR_START) * 60 / totalMins) * 100}%` }}>
                <span className="text-[10px] text-muted-foreground -mt-2">
                  {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        <div className="flex flex-1 overflow-x-auto">
          {days.map((day) => {
            const isToday    = isSameDay(day, new Date());
            const dayEvents  = eventsOnDay(day).filter((e) => !e.allDay);
            const dayTimeOff = timeOff.filter((t) =>
              new Date(t.startsAt) <= endOfDay(day) && new Date(t.endsAt) >= startOfDay(day)
            );

            return (
              <div key={day.toISOString()} className="flex-1 min-w-[100px] border-r border-border last:border-r-0">
                {/* Day header */}
                <div className={cn("h-12 border-b border-border flex flex-col items-center justify-center sticky top-0 bg-background z-10",
                  isToday && "bg-primary/5")}>
                  <span className="text-[10px] text-muted-foreground">{DAY_NAMES[day.getDay()]}</span>
                  <span className={cn("text-sm font-semibold leading-tight",
                    isToday && "text-primary")}>
                    {day.getDate()}
                  </span>
                </div>

                {/* Grid */}
                <div className="relative"
                  style={{ height: `${totalMins * 1.5}px` }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct  = (e.clientY - rect.top) / rect.height;
                    const mins = Math.round(pct * totalMins / 30) * 30;
                    const h    = new Date(day); h.setHours(HOUR_START, 0, 0, 0); h.setMinutes(mins);
                    const end  = new Date(h); end.setMinutes(end.getMinutes() + 60);
                    handleSlotClick(h);
                  }}>

                  {/* Hour lines */}
                  {hours.map((h) => (
                    <div key={h} className="absolute w-full border-t border-border/40"
                      style={{ top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%` }} />
                  ))}

                  {/* Time off overlay */}
                  {dayTimeOff.map((t) => (
                    <div key={t.id}
                      className="absolute inset-x-0 bg-muted/60 border-l-2 border-muted-foreground/30 opacity-60 pointer-events-none z-0"
                      style={{
                        top:    `${getTopPercent(new Date(t.startsAt), HOUR_START)}%`,
                        height: `${getHeightPercent(new Date(t.startsAt), new Date(t.endsAt), HOUR_START)}%`,
                      }}>
                      <p className="text-[10px] text-muted-foreground px-1 pt-0.5 truncate">{t.user?.fullName} — {t.title}</p>
                    </div>
                  ))}

                  {/* Current time indicator */}
                  {isToday && (() => {
                    const now = new Date();
                    const top = getTopPercent(now, HOUR_START);
                    return (
                      <div className="absolute w-full flex items-center z-20 pointer-events-none"
                        style={{ top: `${top}%` }}>
                        <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                        <div className="flex-1 h-px bg-red-500" />
                      </div>
                    );
                  })()}

                  {/* Events */}
                  {dayEvents.map((ev) => (
                    <button key={ev.id}
                      onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                      className={cn("absolute inset-x-0.5 rounded overflow-hidden text-left z-10 hover:opacity-90 transition-opacity",
                        ev.priority === "emergency" && "ring-1 ring-red-400")}
                      style={{
                        top:    `${getTopPercent(ev.startsAt, HOUR_START)}%`,
                        height: `${Math.max(2, getHeightPercent(ev.startsAt, ev.endsAt, HOUR_START))}%`,
                        backgroundColor: getEventColor(ev) + "25",
                        borderLeft: `3px solid ${getEventColor(ev)}`,
                      }}>
                      <div className="px-1.5 py-1">
                        <p className="text-[10px] font-semibold truncate leading-tight" style={{ color: getEventColor(ev) }}>
                          {ev.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {formatTimeRange(ev.startsAt, ev.endsAt)}
                        </p>
                        {ev.customerName && (
                          <p className="text-[10px] text-muted-foreground truncate">{ev.customerName}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Month grid ───────────────────────────────────────────────────────────
  const renderMonth = () => {
    const weeks = getCalendarWeeks(currentDate.getFullYear(), currentDate.getMonth());
    const today = new Date();

    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-border">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="flex-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-border" style={{ minHeight: "100px" }}>
              {week.map((day) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday  = isSameDay(day, today);
                const dayEvs   = eventsOnDay(day).slice(0, 3);
                const overflow = eventsOnDay(day).length - 3;

                return (
                  <div key={day.toISOString()}
                    className={cn("border-r border-border last:border-r-0 p-1 cursor-pointer hover:bg-muted/20 transition-colors",
                      !isCurrentMonth && "bg-muted/10")}
                    onClick={() => handleSlotClick(day)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-xs font-medium h-5 w-5 flex items-center justify-center rounded-full",
                        isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/50")}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {dayEvs.map((ev) => <EventChip key={ev.id} event={ev} onClick={handleEventClick} compact />)}
                      {overflow > 0 && (
                        <p className="text-[10px] text-muted-foreground px-1">+{overflow} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Agenda view ──────────────────────────────────────────────────────────
  const renderAgenda = () => {
    const days: Date[] = [];
    for (let d = new Date(currentDate); d <= addDays(currentDate, 30); d = addDays(d, 1)) {
      if (eventsOnDay(d).length > 0) days.push(new Date(d));
    }

    if (days.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-center py-16">
          <div>
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No appointments in the next 30 days</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto divide-y divide-border">
        {days.map((day) => (
          <div key={day.toISOString()} className="flex">
            <div className="w-24 flex-shrink-0 py-4 px-3 text-right">
              <p className="text-xs font-semibold text-foreground">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
              <p className="text-[10px] text-muted-foreground">{day.toLocaleDateString("en-US", { weekday: "long" })}</p>
            </div>
            <div className="flex-1 py-2 space-y-1.5">
              {eventsOnDay(day).map((ev) => (
                <button key={ev.id} onClick={() => handleEventClick(ev)}
                  className="w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors group">
                  <div className="h-2 w-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: getEventColor(ev) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{ev.title}</p>
                      {ev.priority === "emergency" && <Badge variant="destructive" className="text-[10px] py-0">Emergency</Badge>}
                      {ev.isWaitlisted && <Badge variant="secondary" className="text-[10px] py-0">Waitlist</Badge>}
                    </div>
                    <div className="flex items-center gap-4 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTimeRange(ev.startsAt, ev.endsAt)}</span>
                      {ev.technicianName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{ev.technicianName}</span>}
                      {ev.customerName && <span className="flex items-center gap-1"><span>{ev.customerName}</span></span>}
                      {ev.vehicleLabel && <span className="flex items-center gap-1"><Car className="h-3 w-3" />{ev.vehicleLabel}</span>}
                    </div>
                    {ev.locationAddress && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />{ev.locationAddress}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: STATUS_COLORS[ev.status] ?? "#64748b" }}>
                    {ev.status.replace("_"," ")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── Event detail popover ─────────────────────────────────────────────────
  const renderEventDetail = () => {
    if (!selectedEvent) return null;
    const color = getEventColor(selectedEvent);
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={() => setSelectedEvent(null)}>
        <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}>
          <div className="p-1" style={{ backgroundColor: color + "15", borderBottom: `2px solid ${color}` }}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-semibold text-foreground">{selectedEvent.title}</span>
                {selectedEvent.priority === "emergency" && <Badge variant="destructive" className="text-[10px]">Emergency</Badge>}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: STATUS_COLORS[selectedEvent.status] }}>
                {selectedEvent.status.replace("_"," ")}
              </span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>{formatDate(selectedEvent.startsAt, { short: true })} · {formatTimeRange(selectedEvent.startsAt, selectedEvent.endsAt)}</span>
            </div>
            {selectedEvent.customerName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{selectedEvent.customerName}</span>
              </div>
            )}
            {selectedEvent.vehicleLabel && (
              <div className="flex items-center gap-2 text-sm">
                <Car className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{selectedEvent.vehicleLabel}</span>
              </div>
            )}
            {selectedEvent.technicianName && (
              <div className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{selectedEvent.technicianName}</span>
              </div>
            )}
            {selectedEvent.locationAddress && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a href={`https://maps.google.com/?q=${encodeURIComponent(selectedEvent.locationAddress)}`}
                  target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {selectedEvent.locationAddress}
                </a>
              </div>
            )}
          </div>
          {["OWNER","MANAGER","OFFICE_STAFF"].includes(userRole) && (
            <div className="px-4 pb-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1"
                onClick={() => { setEditAppt({ id: selectedEvent.id }); setSelectedEvent(null); setDialogOpen(true); }}>
                Edit
              </Button>
              {selectedEvent.jobId && (
                <Button size="sm" variant="outline" asChild className="flex-1">
                  <a href={`/jobs/${selectedEvent.jobId}`}>View job</a>
                </Button>
              )}
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => handleDelete(selectedEvent.id)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const weekDays = getWeekDays(startOfWeek(currentDate, 0));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="px-3">Today</Button>
          <Button variant="outline" size="icon-sm" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="text-sm font-semibold text-foreground flex-1 truncate">{headerTitle}</h2>

        {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}

        {/* Technician filter */}
        <Select value={filterTech} onValueChange={setFilterTech}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All technicians" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            {technicians.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex items-center gap-1.5">
                  {t.color && <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
                  {t.fullName}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View switcher */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          {([["day","Day",CalendarDays],["week","Week",Grid3X3],["month","Mo",Grid3X3],["agenda","List",LayoutList]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v as CalendarView)}
              className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>

        {["OWNER","MANAGER","OFFICE_STAFF"].includes(userRole) && (
          <Button size="sm" className="gap-1.5" onClick={() => { setEditAppt(null); setClickedSlot(null); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        )}
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-hidden">
        {view === "day"    && renderTimeGrid([currentDate])}
        {view === "week"   && renderTimeGrid(weekDays)}
        {view === "month"  && renderMonth()}
        {view === "agenda" && renderAgenda()}
      </div>

      {/* Appointment dialog */}
      {dialogOpen && (
        <AppointmentDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditAppt(null); setClickedSlot(null); }}
          onSaved={handleSaved}
          technicians={technicians}
          defaultStartsAt={clickedSlot?.startsAt}
          defaultTechnicianId={clickedSlot?.technicianId}
          editAppointment={editAppt}
        />
      )}

      {/* Event detail */}
      {renderEventDetail()}
    </div>
  );
}
