import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  isAfter,
  addMonths,
  subMonths,
  addDays,
  subDays,
  parseISO,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Phone,
  Camera,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  ArrowRight,
  Trash2,
  LayoutGrid,
  ListFilter,
  TrendingUp,
  Shield,
  Layers,
  Sparkles,
  Smartphone,
  CalendarDays,
  ListOrdered,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { calculate24hTimelineSlots, type DayTimelineSlot } from '../../utils/timeline24h.ts';
import {
  formatVND,
  formatDateTimeVN,
  formatDateVN,
  formatTimeVN,
  BOOKING_STATUS_MAP,
} from '../../utils/formatters.ts';
import type { Booking, BookingItem, Equipment, Customer } from '../../types/index.ts';

interface MonthlyCalendarViewProps {
  bookings: Booking[];
  bookingItems: BookingItem[];
  customers: Customer[];
  equipment: Equipment[];
  onSelectBooking: (bookingId: number) => void;
  onOpenNewBookingWithDate?: (date: Date) => void;
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedEquipmentFilter: number | 'all';
  setSelectedEquipmentFilter: (id: number | 'all') => void;
}

interface WeekTimelineData {
  tracks: (DayTimelineSlot | null)[][];
  overflowCounts: number[];
  allDaySlots: DayTimelineSlot[][];
}

function computeWeekBookingTracks(
  filteredBookings: Booking[],
  weekDays: Date[],
  maxTracks = 3
): WeekTimelineData {
  const allDaySlots = weekDays.map((day) => calculate24hTimelineSlots(filteredBookings, day));
  const seenBookingIds = new Set<number>();
  const weekBookings: Booking[] = [];

  for (const daySlots of allDaySlots) {
    for (const slot of daySlots) {
      if (slot.booking.id && !seenBookingIds.has(slot.booking.id)) {
        seenBookingIds.add(slot.booking.id);
        weekBookings.push(slot.booking);
      }
    }
  }

  // Multi-day bookings first so they take continuous rows across days
  weekBookings.sort((a, b) => {
    const aStart = parseISO(a.start_at).getTime();
    const bStart = parseISO(b.start_at).getTime();
    const aDuration = parseISO(a.end_at).getTime() - aStart;
    const bDuration = parseISO(b.end_at).getTime() - bStart;

    if (aDuration !== bDuration) {
      return bDuration - aDuration;
    }
    return aStart - bStart;
  });

  const tracks: (DayTimelineSlot | null)[][] = Array.from({ length: maxTracks }, () =>
    Array(7).fill(null)
  );
  const overflowCounts = Array(7).fill(0);

  for (const b of weekBookings) {
    const dayIndices: number[] = [];
    const slotByDayIdx = new Map<number, DayTimelineSlot>();

    weekDays.forEach((_, dayIdx) => {
      const slot = allDaySlots[dayIdx].find((s) => s.booking.id === b.id);
      if (slot) {
        dayIndices.push(dayIdx);
        slotByDayIdx.set(dayIdx, slot);
      }
    });

    if (dayIndices.length === 0) continue;

    let targetTrack = -1;
    for (let t = 0; t < maxTracks; t++) {
      const isFree = dayIndices.every((dIdx) => tracks[t][dIdx] === null);
      if (isFree) {
        targetTrack = t;
        break;
      }
    }

    if (targetTrack !== -1) {
      for (const dIdx of dayIndices) {
        tracks[targetTrack][dIdx] = slotByDayIdx.get(dIdx)!;
      }
    } else {
      for (const dIdx of dayIndices) {
        overflowCounts[dIdx]++;
      }
    }
  }

  return { tracks, overflowCounts, allDaySlots };
}

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  bookings,
  bookingItems,
  customers,
  equipment,
  onSelectBooking,
  onOpenNewBookingWithDate,
  currentDate,
  setCurrentDate,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  selectedEquipmentFilter,
  setSelectedEquipmentFilter,
}) => {
  // Core calendar display modes: 'month' (Lưới tháng 24h), 'week' (Lịch tuần 24h), 'agenda' (Lịch biểu & Thẻ ngày)
  const [calendarMode, setCalendarMode] = useState<'month' | 'week' | 'agenda'>('month');
  // Mobile grid layout: 'fit' (vừa 100% màn hình, không cuộn) vs 'scroll' (mở rộng 24h cuộn ngang)
  const [gridStyle, setGridStyle] = useState<'fit' | 'scroll'>('fit');
  const [hoveredBookingId, setHoveredBookingId] = useState<number | null>(null);

  // Currently focused day for card list
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // Quick toggle: Only show actively rented bookings right now
  const [onlyActiveNow, setOnlyActiveNow] = useState<boolean>(false);

  // State for in-app deletion confirmation
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);

  // Lookup maps
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const equipmentMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);

  const itemsByBookingMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const item of bookingItems) {
      const list = map.get(item.booking_id) || [];
      list.push(item.equipment_id);
      map.set(item.booking_id, list);
    }
    return map;
  }, [bookingItems]);

  // Date-fns Month Interval & Weeks
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const calendarStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const calendarEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);

  // All individual days of current month for the horizontal mobile day carousel
  const daysInCurrentMonth = useMemo(() => {
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [monthStart, monthEnd]);

  // All days in the grid including days of previous and next months
  const allGridDays = useMemo(() => {
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [calendarStart, calendarEnd]);

  const weeks = useMemo(() => {
    return eachWeekOfInterval(
      { start: calendarStart, end: calendarEnd },
      { weekStartsOn: 1 }
    ).map((weekStart) => {
      const weekDays = eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
      });
      return { weekStart, weekDays };
    });
  }, [calendarStart, calendarEnd]);

  // Week days for Week Timeline mode
  const selectedWeekStart = useMemo(() => startOfWeek(selectedDay, { weekStartsOn: 1 }), [selectedDay]);
  const selectedWeekEnd = useMemo(() => endOfWeek(selectedDay, { weekStartsOn: 1 }), [selectedDay]);
  const selectedWeekDays = useMemo(() => {
    return eachDayOfInterval({ start: selectedWeekStart, end: selectedWeekEnd });
  }, [selectedWeekStart, selectedWeekEnd]);

  // Month navigation
  const handlePrevMonth = () => setCurrentDate((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentDate((prev) => addMonths(prev, 1));
  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now);
  };

  // Filter Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Only active now toggle
      if (onlyActiveNow && b.status !== 'active') {
        return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }

      // 3. Equipment filter
      if (selectedEquipmentFilter !== 'all') {
        const itemIds = itemsByBookingMap.get(b.id!) || [];
        if (!itemIds.includes(selectedEquipmentFilter)) {
          return false;
        }
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cust = customerMap.get(b.customer_id);
        const matchCode = b.booking_code.toLowerCase().includes(q);
        const matchName = cust?.name.toLowerCase().includes(q);
        const matchPhone = cust?.phone?.toLowerCase().includes(q);
        const itemIds = itemsByBookingMap.get(b.id!) || [];
        const matchEquip = itemIds.some((id) => {
          const eq = equipmentMap.get(id);
          return eq?.name.toLowerCase().includes(q) || eq?.asset_code.toLowerCase().includes(q);
        });
        return matchCode || matchName || matchPhone || matchEquip;
      }

      return true;
    });
  }, [
    bookings,
    statusFilter,
    onlyActiveNow,
    selectedEquipmentFilter,
    searchQuery,
    customerMap,
    equipmentMap,
    itemsByBookingMap,
  ]);

  // Statistics for current month
  const monthStats = useMemo(() => {
    let countActive = 0;
    let countConfirmed = 0;
    let countReturned = 0;
    let projectedRevenue = 0;

    for (const b of bookings) {
      const bStart = parseISO(b.start_at);
      const bEnd = parseISO(b.end_at);
      const overlapsMonth = bStart <= monthEnd && bEnd >= monthStart;

      if (overlapsMonth) {
        if (b.status === 'active') countActive++;
        if (b.status === 'confirmed') countConfirmed++;
        if (b.status === 'returned') countReturned++;
        if (b.status !== 'cancelled') projectedRevenue += b.total_rent || 0;
      }
    }

    return {
      countActive,
      countConfirmed,
      countReturned,
      totalInMonth: countActive + countConfirmed + countReturned,
      projectedRevenue,
    };
  }, [bookings, monthStart, monthEnd]);

  // Bookings grouped by date for Card-based list
  const activeBookingsForSelectedDay = useMemo(() => {
    const dStart = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 0, 0, 0);
    const dEnd = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate(), 23, 59, 59);

    return filteredBookings.filter((b) => {
      const bStart = parseISO(b.start_at);
      const bEnd = parseISO(b.end_at);
      return bStart <= dEnd && bEnd >= dStart;
    });
  }, [selectedDay, filteredBookings]);

  // All bookings for current month sorted by start time
  const allMonthSortedBookings = useMemo(() => {
    return [...filteredBookings].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [filteredBookings]);

  // Bookings count map by YYYY-MM-DD for all days in the grid (including prev/next month)
  const bookingsCountByDay = useMemo(() => {
    const map = new Map<string, { total: number; active: number; confirmed: number; returned: number }>();
    for (const day of allGridDays) {
      const dKey = format(day, 'yyyy-MM-dd');
      const dStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
      const dEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

      let total = 0;
      let active = 0;
      let confirmed = 0;
      let returned = 0;

      for (const b of filteredBookings) {
        const s = parseISO(b.start_at);
        const e = parseISO(b.end_at);
        if (s <= dEnd && e >= dStart) {
          total++;
          if (b.status === 'active') active++;
          else if (b.status === 'confirmed') confirmed++;
          else if (b.status === 'returned') returned++;
        }
      }
      map.set(dKey, { total, active, confirmed, returned });
    }
    return map;
  }, [allGridDays, filteredBookings]);

  // Grouped bookings by day for 'month_list' mode
  const monthBookingsGroupedByDay = useMemo(() => {
    const list: { day: Date; dateStr: string; bookings: Booking[] }[] = [];
    for (const day of daysInCurrentMonth) {
      const dStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
      const dEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
      const dayBookings = filteredBookings.filter((b) => {
        const s = parseISO(b.start_at);
        const e = parseISO(b.end_at);
        return s <= dEnd && e >= dStart;
      });
      if (dayBookings.length > 0) {
        list.push({
          day,
          dateStr: format(day, 'yyyy-MM-dd'),
          bookings: dayBookings,
        });
      }
    }
    return list;
  }, [daysInCurrentMonth, filteredBookings]);

  // Handle in-app deletion of booking
  const handleConfirmDeleteBooking = async () => {
    if (!deletingBooking?.id) return;
    const bId = deletingBooking.id;
    await db.booking_items.where('booking_id').equals(bId).delete();
    await db.transactions.where('booking_id').equals(bId).delete();
    const itemIds = itemsByBookingMap.get(bId) || [];
    for (const eqId of itemIds) {
      await db.equipment.update(eqId, { status: 'available' });
    }
    await db.bookings.delete(bId);
    setDeletingBooking(null);
  };

  const dayStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (calendarMode === 'agenda' && dayStripRef.current) {
      const selectedEl = dayStripRef.current.querySelector('[data-selected="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedDay, calendarMode]);

  const renderBookingCard = (b: Booking, targetDay: Date = selectedDay) => {
    const customer = customerMap.get(b.customer_id);
    const itemIds = itemsByBookingMap.get(b.id!) || [];
    const equipItems = itemIds.map((id) => equipmentMap.get(id)).filter(Boolean) as Equipment[];
    const statusConfig = BOOKING_STATUS_MAP[b.status] || BOOKING_STATUS_MAP.draft;

    const slots = calculate24hTimelineSlots([b], targetDay);
    const slot = slots[0];

    const bStart = parseISO(b.start_at);
    const bEnd = parseISO(b.end_at);
    const totalHours = Math.round(((bEnd.getTime() - bStart.getTime()) / (1000 * 60 * 60)) * 10) / 10;
    const totalDays = Math.max(1, Math.ceil(totalHours / 24));

    return (
      <div
        key={b.id}
        className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3 hover:border-cyan-300 transition"
      >
        {/* Top: Code + Customer + Status + Call */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-200">
                {b.booking_code}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${statusConfig.bg}`}>
                {statusConfig.label}
              </span>
              {totalDays > 1 && (
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">
                  Thuê {totalDays} ngày
                </span>
              )}
            </div>
            <h4 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
              <User className="w-4 h-4 text-cyan-600 shrink-0" />
              <span>{customer?.name || 'Khách hàng'}</span>
            </h4>
          </div>

          {customer?.phone && (
            <a
              href={`tel:${customer.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition active:scale-95 shrink-0"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gọi {customer.phone}</span>
            </a>
          )}
        </div>

        {/* Visual 24h timeline bar for targetDay */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between text-xs font-bold gap-1">
            <span className="text-slate-600 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-cyan-600" />
              <span>Khung giờ thuê trong ngày:</span>
            </span>
            <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 text-xs font-black">
              ⏰ Khách trả máy: {formatTimeVN(b.end_at)} ({formatDateVN(b.end_at).slice(0, 5)})
            </span>
          </div>

          <div className="relative pt-1 pb-3">
            <div className="w-full h-2.5 rounded-full bg-slate-200 relative overflow-hidden">
              {slot && (
                <div
                  style={{
                    left: `${slot.startPercent}%`,
                    width: `${slot.widthPercent}%`,
                  }}
                  className={`absolute top-0 bottom-0 rounded-xs transition-all ${
                    b.status === 'active'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                  }`}
                />
              )}
            </div>
            <div className="flex justify-between text-[9.5px] text-slate-400 font-semibold mt-1 px-0.5">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-slate-200/60 gap-1 text-slate-700">
            <span>
              🟢 Nhận máy: <strong>{formatDateTimeVN(b.start_at)}</strong>
            </span>
            <span className="text-amber-900 font-bold">
              🔴 Trả máy: <strong>{formatDateTimeVN(b.end_at)}</strong>
            </span>
          </div>
        </div>

        {/* Equipment details */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 block">Thiết bị thuê:</span>
          <div className="flex flex-wrap gap-1.5">
            {equipItems.map((eq) => (
              <span
                key={eq.id}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-50/70 border border-cyan-200 px-2 py-0.5 text-xs font-semibold text-slate-800"
              >
                <Camera className="w-3.5 h-3.5 text-cyan-700" />
                <span>{eq.name}</span>
                <span className="font-mono text-[10px] text-slate-500">({eq.asset_code})</span>
              </span>
            ))}
          </div>
        </div>

        {/* Financials & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
          <div className="text-xs">
            <span className="text-slate-500">Tiền thuê: </span>
            <strong className="text-emerald-700 text-sm font-black">{formatVND(b.total_rent)}</strong>
            <span className="text-slate-300 mx-1.5">•</span>
            <span className="text-slate-500">Cọc giữ lịch: </span>
            <strong className="text-cyan-800 font-bold">{formatVND(b.deposit_holding_received ?? b.deposit_holding_required ?? 0)}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeletingBooking(b)}
              className="p-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition active:scale-95"
              title="Xóa đơn thuê"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => b.id && onSelectBooking(b.id)}
              className="flex items-center gap-1 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 text-xs font-bold transition shadow-xs active:scale-95"
            >
              <span>Xem chi tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 text-slate-800 w-full max-w-full overflow-hidden">
      {/* 1. TOP HEADER & DATE NAVIGATION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Month Title & Prev/Next */}
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-700 transition active:scale-95 touch-manipulation"
              title="Tháng trước"
              aria-label="Tháng trước"
            >
              <ChevronLeft className="w-5 h-5 text-slate-700" />
            </button>

            <button
              onClick={handleNextMonth}
              className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-700 transition active:scale-95 touch-manipulation"
              title="Tháng sau"
              aria-label="Tháng sau"
            >
              <ChevronRight className="w-5 h-5 text-slate-700" />
            </button>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-xl font-black text-slate-900 capitalize tracking-tight">
                {format(currentDate, 'MMMM yyyy', { locale: vi })}
              </h2>

              <button
                onClick={handleToday}
                className="rounded-xl border border-cyan-200 bg-cyan-50/80 px-2.5 py-1 text-xs font-bold text-cyan-800 hover:bg-cyan-100 transition shadow-2xs active:scale-95 touch-manipulation"
              >
                Hôm nay
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[10.5px] sm:text-[11px] text-slate-500 font-medium mt-0.5 flex-wrap">
              <span className="hidden sm:inline">Lưới 7 cột:</span>
              <span className="font-bold text-cyan-800 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-200">
                {format(calendarStart, 'dd/MM')} (Thg {format(calendarStart, 'M')}) → {format(calendarEnd, 'dd/MM')} (Thg {format(calendarEnd, 'M')})
              </span>
              {(format(calendarStart, 'M') !== format(currentDate, 'M') ||
                format(calendarEnd, 'M') !== format(currentDate, 'M')) && (
                <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  Gối đầu Thg {format(calendarStart, 'M')} & Thg {format(calendarEnd, 'M')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View Switcher for Mobile & Desktop */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-stretch sm:self-auto justify-between sm:justify-end gap-1">
          <button
            type="button"
            onClick={() => setCalendarMode('month')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 touch-manipulation ${
              calendarMode === 'month'
                ? 'bg-white text-cyan-800 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-cyan-600" />
            <span>Lưới Tháng</span>
          </button>

          <button
            type="button"
            onClick={() => setCalendarMode('week')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 touch-manipulation ${
              calendarMode === 'week'
                ? 'bg-white text-cyan-800 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
            <span>Lịch Tuần</span>
          </button>

          <button
            type="button"
            onClick={() => setCalendarMode('agenda')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 touch-manipulation ${
              calendarMode === 'agenda'
                ? 'bg-white text-cyan-800 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 text-emerald-600" />
            <span>Lịch Biểu</span>
          </button>
        </div>
      </div>

      {/* 2. SUMMARY METRICS BAR */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-2xs flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <span className="text-slate-500 text-[10px] sm:text-xs block">Đơn tháng này</span>
            <strong className="text-sm sm:text-base font-black text-slate-900">
              {monthStats.totalInMonth} đơn
            </strong>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 sm:p-3 shadow-2xs flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 relative">
            <Clock className="w-4 h-4" />
            {monthStats.countActive > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            )}
          </div>
          <div>
            <span className="text-emerald-800 text-[10px] sm:text-xs block font-semibold">Đang giữ máy</span>
            <strong className="text-sm sm:text-base font-black text-emerald-900">
              {monthStats.countActive} đơn
            </strong>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 sm:p-3 shadow-2xs flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="text-indigo-800 text-[10px] sm:text-xs block font-semibold">Đã chốt chờ giao</span>
            <strong className="text-sm sm:text-base font-black text-indigo-900">
              {monthStats.countConfirmed} đơn
            </strong>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-2xs flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-slate-500 text-[10px] sm:text-xs block">Dự kiến thu</span>
            <strong className="text-sm sm:text-base font-black text-emerald-700 truncate block">
              {formatVND(monthStats.projectedRevenue)}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. FILTER BAR */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Scrollable Status Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => {
                setStatusFilter('all');
                setOnlyActiveNow(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 touch-manipulation ${
                statusFilter === 'all' && !onlyActiveNow
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tất cả ({bookings.length})
            </button>

            <button
              onClick={() => {
                setOnlyActiveNow(true);
                setStatusFilter('active');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 touch-manipulation ${
                onlyActiveNow || statusFilter === 'active'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Đang thuê ({bookings.filter((b) => b.status === 'active').length})</span>
            </button>

            <button
              onClick={() => {
                setOnlyActiveNow(false);
                setStatusFilter('confirmed');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 touch-manipulation ${
                statusFilter === 'confirmed' && !onlyActiveNow
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Đã chốt ({bookings.filter((b) => b.status === 'confirmed').length})</span>
            </button>

            <button
              onClick={() => {
                setOnlyActiveNow(false);
                setStatusFilter('returned');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition active:scale-95 touch-manipulation ${
                statusFilter === 'returned' && !onlyActiveNow
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Đã trả ({bookings.filter((b) => b.status === 'returned').length})</span>
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm khách, SĐT, máy..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-cyan-500 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Equipment Filter Dropdown */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2 flex-1">
            <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 hidden sm:inline">Lọc theo máy:</span>
            <select
              value={selectedEquipmentFilter}
              onChange={(e) =>
                setSelectedEquipmentFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 focus:outline-none flex-1 sm:flex-initial max-w-full sm:max-w-xs"
            >
              <option value="all">Tất cả thiết bị trong kho ({equipment.length})</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.asset_code} - {eq.name}
                </option>
              ))}
            </select>
          </div>

          {selectedEquipmentFilter !== 'all' && (
            <button
              onClick={() => setSelectedEquipmentFilter('all')}
              className="text-[11px] font-bold text-cyan-600 hover:underline shrink-0"
            >
              Bỏ lọc máy
            </button>
          )}
        </div>
      </div>

      {/* 4. CHẾ ĐỘ 1: LƯỚI THÁNG 24H (MONTH GRID - BAO GỒM CẢ THÁNG TRƯỚC VÀ THÁNG SAU) */}
      {calendarMode === 'month' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header Banner */}
            <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-cyan-50/20 to-blue-50/20 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="min-w-0">
                <span className="font-black text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                  <CalendarIcon className="w-4 h-4 text-cyan-600 shrink-0" />
                  <span>Lưới Tháng Tỉ Lệ 24h (00:00 - 23:59)</span>
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-500 block mt-0.5 truncate">
                  Timeline nối liền qua các ngày • Hiển thị cả ngày gối đầu Tháng {format(calendarStart, 'M')} & Tháng {format(calendarEnd, 'M')}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Đang thuê
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span> Đã chốt
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span> Đã trả
                </span>

                {/* Mobile Grid Style Switcher */}
                <div className="sm:hidden flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-1">
                  <button
                    type="button"
                    onClick={() => setGridStyle('fit')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                      gridStyle === 'fit'
                        ? 'bg-white text-cyan-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📱 Gọn
                  </button>
                  <button
                    type="button"
                    onClick={() => setGridStyle('scroll')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                      gridStyle === 'scroll'
                        ? 'bg-white text-cyan-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ↔️ Cuộn 24h
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Week Jump Pills for Mobile Scroll Mode */}
            {gridStyle === 'scroll' && (
              <div className="sm:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[10.5px]">
                <span className="text-slate-400 font-bold shrink-0">Nhảy đến:</span>
                {weeks.map(({ weekStart, weekDays }, wIdx) => {
                  const endW = weekDays[weekDays.length - 1];
                  const hasSelected = weekDays.some((d) => isSameDay(d, selectedDay));
                  return (
                    <button
                      key={wIdx}
                      type="button"
                      onClick={() => setSelectedDay(weekStart)}
                      className={`px-2 py-0.5 rounded-md font-bold shrink-0 transition active:scale-95 ${
                        hasSelected
                          ? 'bg-cyan-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Tuần {wIdx + 1} ({format(weekStart, 'dd/MM')} - {format(endW, 'dd/MM')})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Grid Container (supports 100% fit on mobile or wide scroll) */}
            <div className={gridStyle === 'scroll' ? 'overflow-x-auto pb-1 scrollbar-none' : 'w-full'}>
              <div className={gridStyle === 'scroll' ? 'min-w-[720px]' : 'w-full'}>
                {/* Day of Week Headers (7 Columns) */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-[10px] sm:text-xs font-black text-slate-700">
                  {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                    <div key={d} className="py-2 border-r last:border-r-0 border-slate-200">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days Grid with Connected Multi-day Timelines across ALL days */}
                <div className="divide-y divide-slate-200">
                  {weeks.map(({ weekStart, weekDays }) => {
                    const { tracks, overflowCounts, allDaySlots } = computeWeekBookingTracks(
                      filteredBookings,
                      weekDays,
                      3
                    );

                    return (
                      <div key={weekStart.toISOString()} className="grid grid-cols-7 divide-x divide-slate-200">
                        {weekDays.map((day, dayIdx) => {
                          const inCurrentMonth = isSameMonth(day, currentDate);
                          const isPrevMonth = isBefore(day, monthStart);
                          const isNextMonth = isAfter(day, monthEnd);
                          const isCurrentDay = isToday(day);
                          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                          const daySlots = allDaySlots[dayIdx];

                          return (
                            <div
                              key={day.toISOString()}
                              onClick={() => setSelectedDay(day)}
                              className={`min-h-[74px] sm:min-h-[110px] md:min-h-[125px] p-1 sm:p-1.5 flex flex-col justify-between transition cursor-pointer select-none active:scale-[0.99] touch-manipulation group ${
                                isSelected
                                  ? 'bg-cyan-50/90 ring-2 ring-cyan-500 ring-inset z-20 shadow-xs'
                                  : isCurrentDay
                                  ? 'bg-cyan-50/40'
                                  : isPrevMonth
                                  ? 'bg-amber-50/25 hover:bg-amber-50/50'
                                  : isNextMonth
                                  ? 'bg-blue-50/25 hover:bg-blue-50/50'
                                  : 'bg-white hover:bg-slate-50/90'
                              }`}
                            >
                              {/* Top: Day number & Month Indicator for edge days & Bookings Count */}
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span
                                    className={`text-xs font-black transition ${
                                      isCurrentDay
                                        ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow-xs text-[11px] sm:text-xs'
                                        : inCurrentMonth
                                        ? isSelected
                                          ? 'text-cyan-800'
                                          : 'text-slate-900'
                                        : isPrevMonth
                                        ? 'text-amber-900 font-bold'
                                        : 'text-blue-900 font-bold'
                                    }`}
                                  >
                                    {format(day, 'd')}
                                  </span>

                                  {/* Distinct Month Badge for Previous & Next Months */}
                                  {isPrevMonth && (
                                    <span className="text-[8px] sm:text-[9.5px] font-black text-amber-800 bg-amber-100/90 border border-amber-300 px-1 py-0.2 rounded leading-none shrink-0">
                                      Thg {format(day, 'M')}
                                    </span>
                                  )}
                                  {isNextMonth && (
                                    <span className="text-[8px] sm:text-[9.5px] font-black text-blue-800 bg-blue-100/90 border border-blue-300 px-1 py-0.2 rounded leading-none shrink-0">
                                      Thg {format(day, 'M')}
                                    </span>
                                  )}
                                </div>

                                {/* Prominent Bookings Count Badge */}
                                {daySlots.length > 0 && (
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[8.5px] sm:text-[10px] font-black leading-none shadow-2xs shrink-0 ${
                                      inCurrentMonth
                                        ? 'bg-cyan-600 text-white'
                                        : isPrevMonth
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-blue-600 text-white'
                                    }`}
                                    title={`Ngày ${formatDateVN(day)} có ${daySlots.length} đơn thuê`}
                                  >
                                    {daySlots.length}
                                    <span className="hidden sm:inline ml-0.5">đơn</span>
                                  </span>
                                )}
                              </div>

                              {/* Middle: Connected Multi-day Timeline Tracks */}
                              <div className="space-y-1 my-0.5 flex-1">
                                {tracks.map((track, tIdx) => {
                                  const slot = track[dayIdx];
                                  if (!slot) {
                                    return <div key={`empty-${tIdx}`} className="h-[12px] sm:h-[28px] my-0.5" />;
                                  }

                                  const b = slot.booking;
                                  const isHovered = hoveredBookingId === b.id;
                                  const cust = customerMap.get(b.customer_id);
                                  const customerName = cust?.name || b.booking_code;
                                  const itemIds = itemsByBookingMap.get(b.id!) || [];
                                  const firstEquip = itemIds.length > 0 ? equipmentMap.get(itemIds[0]) : null;
                                  const equipLabel = firstEquip ? firstEquip.name : b.booking_code;

                                  const isStart = slot.startsOnThisDay;
                                  const isEnd = slot.endsOnThisDay;

                                  let themeBg = 'bg-blue-600 text-white';
                                  if (b.status === 'active') {
                                    themeBg = 'bg-emerald-600 text-white';
                                  } else if (b.status === 'returned') {
                                    themeBg = 'bg-slate-500 text-white';
                                  }

                                  // Edge-to-edge connection classes so multi-day bookings connect flush across day columns with NO gap!
                                  let connectionClass = 'rounded-md mx-0.5';
                                  if (isStart && !isEnd) {
                                    connectionClass = 'rounded-l-md rounded-r-none -mr-1 sm:-mr-1.5 z-10 shadow-xs';
                                  } else if (!isStart && !isEnd) {
                                    connectionClass = 'rounded-none -mx-1 sm:-mx-1.5 z-10';
                                  } else if (!isStart && isEnd) {
                                    connectionClass = 'rounded-r-md rounded-l-none -ml-1 sm:-ml-1.5 z-10 shadow-xs';
                                  }

                                  return (
                                    <div
                                      key={`slot-${b.id}-${tIdx}`}
                                      onMouseEnter={() => setHoveredBookingId(b.id || null)}
                                      onMouseLeave={() => setHoveredBookingId(null)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (b.id) onSelectBooking(b.id);
                                      }}
                                      className={`px-1 py-0.5 flex flex-col justify-between font-bold cursor-pointer transition select-none ${themeBg} ${connectionClass} ${
                                        gridStyle === 'fit' ? 'h-[14px] sm:h-[28px]' : 'h-[28px]'
                                      } ${
                                        isHovered ? 'ring-2 ring-white ring-offset-1 shadow-md brightness-110 z-20' : ''
                                      }`}
                                      title={`Khách: ${customerName} (${b.booking_code}) • Máy: ${equipLabel} • Nhận: ${formatDateTimeVN(b.start_at)} → Trả: ${formatDateTimeVN(b.end_at)}`}
                                    >
                                      {/* Desktop & Scroll Mode View */}
                                      <div className={`${gridStyle === 'fit' ? 'hidden sm:flex' : 'flex'} items-center justify-between gap-1 leading-none truncate text-[8px] sm:text-[9px]`}>
                                        <span className="truncate flex items-center gap-1 font-black">
                                          {isStart && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0"></span>}
                                          {!isStart && !isEnd && <span className="text-[7px] opacity-75 shrink-0">⟷</span>}
                                          <span className="truncate">{customerName}</span>
                                        </span>

                                        {isStart && !isEnd ? (
                                          <span className="text-[6.5px] sm:text-[7.5px] font-black bg-black/25 px-1 py-0.2 rounded shrink-0">
                                            Nhận {slot.startTimeStr}
                                          </span>
                                        ) : !isStart && isEnd ? (
                                          <span className="text-[6.5px] sm:text-[7.5px] font-black bg-black/25 px-1 py-0.2 rounded shrink-0">
                                            ⏰ Trả {slot.endTimeStr}
                                          </span>
                                        ) : isStart && isEnd ? (
                                          <span className="text-[6.5px] sm:text-[7.5px] font-bold opacity-90 shrink-0">
                                            {slot.startTimeStr}-{slot.endTimeStr}
                                          </span>
                                        ) : null}
                                      </div>

                                      {/* Desktop 24h proportional timeline progress */}
                                      <div className={`${gridStyle === 'fit' ? 'hidden sm:block' : 'block'} w-full h-1 rounded-full bg-black/25 relative overflow-hidden mt-0.5`}>
                                        <div
                                          style={{
                                            left: `${slot.startPercent}%`,
                                            width: `${slot.widthPercent}%`,
                                          }}
                                          className="absolute top-0 bottom-0 bg-white/90 rounded-full"
                                        />
                                      </div>

                                      {/* Mobile Fit Mode Minimalist Timeline Bar */}
                                      <div className={`${gridStyle === 'fit' ? 'flex sm:hidden' : 'hidden'} items-center justify-between h-full px-0.5 text-[7px] leading-none`}>
                                        {isStart ? (
                                          <span className="font-black truncate">▶ {slot.startTimeStr}</span>
                                        ) : isEnd ? (
                                          <span className="font-black truncate ml-auto">⏰ {slot.endTimeStr}</span>
                                        ) : (
                                          <span className="opacity-80 mx-auto text-[6px]">⟷</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Overflow indicator */}
                                {overflowCounts[dayIdx] > 0 && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDay(day);
                                    }}
                                    className="text-[7.5px] sm:text-[9px] font-black text-cyan-700 text-center hover:underline pt-0.5 cursor-pointer truncate"
                                  >
                                    +{overflowCounts[dayIdx]} đơn nữa...
                                  </div>
                                )}
                              </div>

                              {/* Bottom Spacer / Quick Add Button */}
                              <div className="flex items-center justify-between text-[8px] sm:text-[9px] text-slate-400 pt-0.5">
                                <span className="hidden sm:inline text-[8.5px] text-slate-400 truncate">
                                  {daySlots.length === 0 ? 'Trống' : ''}
                                </span>

                                {onOpenNewBookingWithDate && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenNewBookingWithDate(day);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded hover:bg-cyan-100 text-cyan-700 hidden sm:block ml-auto"
                                    title={`Tạo đơn mới ngày ${formatDateVN(day)}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* FOCUSED DAY CARDS & INTERACTIVE 24H TIMELINE UNDER MONTH GRID */}
          <div className="space-y-3 pt-1">
            {/* Header of Focused Day */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 sm:p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-700 block">
                  Chi Tiết Lịch Ngày Đang Chọn
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 capitalize flex items-center gap-2 flex-wrap">
                  <span>{format(selectedDay, 'EEEE, dd/MM/yyyy', { locale: vi })}</span>
                  {isToday(selectedDay) && (
                    <span className="rounded-md bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                      Hôm nay
                    </span>
                  )}
                  {!isSameMonth(selectedDay, currentDate) && (
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                      isBefore(selectedDay, monthStart)
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-blue-100 text-blue-900 border-blue-300'
                    }`}>
                      Thuộc Tháng {format(selectedDay, 'M/yyyy')}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {activeBookingsForSelectedDay.length > 0
                    ? `Có ${activeBookingsForSelectedDay.length} đơn thuê hoạt động trong ngày này.`
                    : 'Kho máy hoàn toàn rảnh rỗi vào ngày này.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isSameMonth(selectedDay, currentDate) && (
                  <button
                    type="button"
                    onClick={() => setCurrentDate(selectedDay)}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 shadow-2xs transition active:scale-95"
                  >
                    <span>Mở Lịch Tháng {format(selectedDay, 'M')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {onOpenNewBookingWithDate && (
                  <button
                    type="button"
                    onClick={() => onOpenNewBookingWithDate(selectedDay)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition touch-manipulation"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tạo đơn ngày này</span>
                  </button>
                )}
              </div>
            </div>

            {/* Previous / Next Month Navigation Banner if day is not in current month */}
            {!isSameMonth(selectedDay, currentDate) && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Bạn đang xem ngày gối đầu thuộc Tháng {format(selectedDay, 'M/yyyy')}. (Lưới hiện tại lấy trọng tâm Tháng {format(currentDate, 'M/yyyy')})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentDate(selectedDay)}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition active:scale-95 shadow-2xs flex items-center gap-1 shrink-0"
                >
                  <span>Chuyển sang xem toàn bộ Tháng {format(selectedDay, 'M')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* VISUAL 24-HOUR GANTT TIMELINE RULER FOR SELECTED DAY */}
            {activeBookingsForSelectedDay.length > 0 && (
              <div className="bg-slate-900 text-white rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5 text-cyan-400">
                    <Clock className="w-4 h-4" />
                    <span>Timeline 24 Giờ Chi Tiết (00:00 - 23:59)</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Ngày {format(selectedDay, 'dd/MM/yyyy')}
                  </span>
                </div>

                {/* 24-Hour Axis */}
                <div className="relative pt-2 pb-1">
                  <div className="grid grid-cols-6 text-[9px] sm:text-[10px] font-mono text-slate-400 border-b border-slate-700 pb-1">
                    <span>00:00</span>
                    <span className="text-center">04:00</span>
                    <span className="text-center">08:00</span>
                    <span className="text-center">12:00</span>
                    <span className="text-center">16:00</span>
                    <span className="text-right">20:00</span>
                  </div>

                  {/* Booking Slots laid out along 24h Axis */}
                  <div className="space-y-2 mt-2.5">
                    {activeBookingsForSelectedDay.map((b) => {
                      const slots = calculate24hTimelineSlots([b], selectedDay);
                      const slot = slots[0];
                      if (!slot) return null;

                      const cust = customerMap.get(b.customer_id);
                      const itemIds = itemsByBookingMap.get(b.id!) || [];
                      const firstEquip = itemIds.length > 0 ? equipmentMap.get(itemIds[0]) : null;

                      let barColor = 'bg-blue-500';
                      if (b.status === 'active') barColor = 'bg-emerald-500';
                      else if (b.status === 'returned') barColor = 'bg-slate-500';

                      return (
                        <div key={b.id} className="relative h-9 rounded-xl bg-slate-800/80 border border-slate-700/60 overflow-hidden">
                          {/* 24h guide vertical lines */}
                          <div className="absolute inset-0 grid grid-cols-6 pointer-events-none opacity-20">
                            <div className="border-r border-slate-600"></div>
                            <div className="border-r border-slate-600"></div>
                            <div className="border-r border-slate-600"></div>
                            <div className="border-r border-slate-600"></div>
                            <div className="border-r border-slate-600"></div>
                            <div></div>
                          </div>

                          {/* The proportional 24h timeline bar */}
                          <div
                            onClick={() => b.id && onSelectBooking(b.id)}
                            style={{
                              left: `${slot.startPercent}%`,
                              width: `${Math.max(6, slot.widthPercent)}%`,
                            }}
                            className={`absolute top-1 bottom-1 ${barColor} text-white rounded-lg px-2 flex items-center justify-between text-[10.5px] font-bold cursor-pointer hover:brightness-110 shadow-sm transition truncate`}
                            title={`Bấm xem đơn: ${b.booking_code} • Khách: ${cust?.name || 'Khách'} • ${slot.startTimeStr} → ${slot.endTimeStr}`}
                          >
                            <span className="truncate flex items-center gap-1.5">
                              <span className="font-mono text-[9px] bg-black/30 px-1 py-0.2 rounded shrink-0">
                                {b.booking_code}
                              </span>
                              <span className="truncate font-black">{cust?.name || 'Khách'}</span>
                              {firstEquip && (
                                <span className="opacity-80 text-[9.5px] hidden md:inline truncate">
                                  ({firstEquip.name})
                                </span>
                              )}
                            </span>

                            <span className="text-[9px] font-mono bg-black/25 px-1.5 py-0.5 rounded shrink-0 ml-1">
                              {slot.startTimeStr} → {slot.endTimeStr}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Individual Booking Cards */}
            {activeBookingsForSelectedDay.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-600 mx-auto flex items-center justify-center mb-2">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">Kho máy hoàn toàn rảnh rỗi</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Không có đơn thuê nào vào ngày {formatDateVN(selectedDay)}. Bạn có thể bấm vào ngày khác trên lưới để xem, hoặc tạo đơn mới.
                </p>
                {onOpenNewBookingWithDate && (
                  <button
                    type="button"
                    onClick={() => onOpenNewBookingWithDate(selectedDay)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Tạo đơn thuê cho ngày này</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {activeBookingsForSelectedDay.map((b) => renderBookingCard(b, selectedDay))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CHẾ ĐỘ 2: LỊCH TUẦN 24H (WEEK TIMELINE - CHI TIẾT CAO CHO ĐIỆN THOẠI & TABLET) */}
      {calendarMode === 'week' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Week Navigation Header */}
            <div className="p-3.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/30 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                <h3 className="font-black text-slate-900 text-xs sm:text-sm">
                  Lịch Tuần: {format(selectedWeekStart, 'dd/MM')} – {format(selectedWeekEnd, 'dd/MM/yyyy')}
                </h3>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDay((prev) => subDays(prev, 7))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold transition active:scale-95 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Tuần trước</span>
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2.5 py-1 rounded-lg border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 font-bold transition active:scale-95"
                >
                  Tuần này
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDay((prev) => addDays(prev, 7))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold transition active:scale-95 flex items-center gap-1"
                >
                  <span>Tuần sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 7 Columns for the Week */}
            <div className="overflow-x-auto pb-1 scrollbar-none">
              <div className="min-w-[650px] sm:min-w-full">
                {/* Headers */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-xs font-black text-slate-700">
                  {selectedWeekDays.map((day) => {
                    const isCur = isToday(day);
                    const isSel = isSameDay(day, selectedDay);
                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => setSelectedDay(day)}
                        className={`py-2 px-1 border-r last:border-r-0 border-slate-200 cursor-pointer transition ${
                          isSel ? 'bg-cyan-100 text-cyan-900 font-black' : isCur ? 'bg-cyan-50 text-cyan-800' : ''
                        }`}
                      >
                        <span className="block text-[10px] uppercase text-slate-500 font-bold">
                          {format(day, 'EEEE', { locale: vi }).replace('Thứ ', 'T')}
                        </span>
                        <span className="text-sm font-black">{format(day, 'dd/MM')}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Week Day Columns */}
                {(() => {
                  const { tracks, overflowCounts, allDaySlots } = computeWeekBookingTracks(
                    filteredBookings,
                    selectedWeekDays,
                    6
                  );

                  return (
                    <div className="grid grid-cols-7 divide-x divide-slate-200">
                      {selectedWeekDays.map((day, dayIdx) => {
                        const isCur = isToday(day);
                        const isSel = isSameDay(day, selectedDay);
                        const daySlots = allDaySlots[dayIdx];

                        return (
                          <div
                            key={day.toISOString()}
                            onClick={() => setSelectedDay(day)}
                            className={`min-h-[220px] sm:min-h-[280px] p-1.5 flex flex-col justify-between transition cursor-pointer ${
                              isSel
                                ? 'bg-cyan-50/80 ring-2 ring-cyan-500 ring-inset'
                                : isCur
                                ? 'bg-cyan-50/30'
                                : 'bg-white hover:bg-slate-50/70'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-100 text-[10px]">
                                <span className="font-bold text-slate-500">
                                  {daySlots.length > 0 ? `${daySlots.length} đơn` : 'Rảnh'}
                                </span>
                                {onOpenNewBookingWithDate && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenNewBookingWithDate(day);
                                    }}
                                    className="p-0.5 rounded text-cyan-600 hover:bg-cyan-100"
                                    title="Tạo đơn ngày này"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Tracks */}
                              <div className="space-y-1.5">
                                {tracks.map((track, tIdx) => {
                                  const slot = track[dayIdx];
                                  if (!slot) return null;

                                  const b = slot.booking;
                                  const cust = customerMap.get(b.customer_id);
                                  const isStart = slot.startsOnThisDay;
                                  const isEnd = slot.endsOnThisDay;

                                  let themeBg = 'bg-blue-600 text-white';
                                  if (b.status === 'active') themeBg = 'bg-emerald-600 text-white';
                                  else if (b.status === 'returned') themeBg = 'bg-slate-500 text-white';

                                  let connectionClass = 'rounded-md mx-0.5';
                                  if (isStart && !isEnd) connectionClass = 'rounded-l-md rounded-r-none -mr-2 z-10 shadow-xs';
                                  else if (!isStart && !isEnd) connectionClass = 'rounded-none -mx-2 z-10';
                                  else if (!isStart && isEnd) connectionClass = 'rounded-r-md rounded-l-none -ml-2 z-10 shadow-xs';

                                  return (
                                    <div
                                      key={`week-slot-${b.id}-${tIdx}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (b.id) onSelectBooking(b.id);
                                      }}
                                      className={`p-1.5 text-[9px] font-bold cursor-pointer transition select-none shadow-xs ${themeBg} ${connectionClass}`}
                                    >
                                      <div className="truncate font-black flex items-center justify-between gap-1">
                                        <span className="truncate">{cust?.name || b.booking_code}</span>
                                        {isStart && <span className="text-[7.5px] bg-black/20 px-1 rounded">{slot.startTimeStr}</span>}
                                        {isEnd && <span className="text-[7.5px] bg-black/20 px-1 rounded">Trả {slot.endTimeStr}</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="text-[9px] text-center text-slate-400 pt-2">
                              {daySlots.length === 0 ? 'Không có lịch' : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Focused Day Details */}
          <div className="space-y-3 pt-1">
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <h4 className="font-black text-slate-900 text-sm">
                Chi tiết ngày {format(selectedDay, 'EEEE, dd/MM/yyyy', { locale: vi })}
              </h4>
              {onOpenNewBookingWithDate && (
                <button
                  type="button"
                  onClick={() => onOpenNewBookingWithDate(selectedDay)}
                  className="rounded-xl bg-cyan-600 text-white px-3 py-1.5 text-xs font-bold shadow-xs hover:bg-cyan-700 transition"
                >
                  + Tạo đơn ngày này
                </button>
              )}
            </div>

            {activeBookingsForSelectedDay.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs text-xs text-slate-500">
                Không có đơn thuê nào vào ngày này.
              </div>
            ) : (
              <div className="space-y-3">
                {activeBookingsForSelectedDay.map((b) => renderBookingCard(b, selectedDay))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. CHẾ ĐỘ 3: LỊCH BIỂU (AGENDA - DẠNG DANH SÁCH CUỘN VÀ CAROUSEL NGÀY) */}
      {calendarMode === 'agenda' && (
        <div className="space-y-4">
          {/* HORIZONTAL DAY STRIP CAROUSEL */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-cyan-600" />
                <span className="text-xs font-black text-slate-900">
                  Lịch ngày tháng {format(currentDate, 'MM/yyyy')}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDay((prev) => subDays(prev, 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
                  title="Ngày trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200 hover:bg-cyan-100 transition"
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDay((prev) => addDays(prev, 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
                  title="Ngày sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Day Strip */}
            <div
              ref={dayStripRef}
              className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none no-scrollbar scroll-smooth"
            >
              {allGridDays.map((day) => {
                const isSel = isSameDay(day, selectedDay);
                const isCur = isToday(day);
                const inCurMonth = isSameMonth(day, currentDate);
                const dKey = format(day, 'yyyy-MM-dd');
                const info = bookingsCountByDay.get(dKey);
                const count = info?.total || 0;

                return (
                  <button
                    key={dKey}
                    type="button"
                    data-selected={isSel ? 'true' : 'false'}
                    onClick={() => setSelectedDay(day)}
                    className={`flex flex-col items-center justify-center shrink-0 min-w-[52px] sm:min-w-[60px] py-2 px-1 rounded-2xl transition active:scale-95 text-center touch-manipulation ${
                      isSel
                        ? 'bg-gradient-to-b from-cyan-600 to-blue-600 text-white shadow-md ring-2 ring-cyan-400 ring-offset-1 scale-105 z-10'
                        : isCur
                        ? 'bg-cyan-50 border-2 border-cyan-400 text-cyan-950 font-bold'
                        : count > 0
                        ? 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-2xs'
                        : 'bg-slate-50/70 border border-slate-100 text-slate-500 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`text-[9px] font-bold uppercase leading-none ${
                        isSel ? 'text-cyan-100' : isCur ? 'text-cyan-700' : 'text-slate-400'
                      }`}
                    >
                      {format(day, 'EEE', { locale: vi })}
                    </span>
                    <span className="text-base font-black my-0.5 leading-none">{format(day, 'd')}</span>
                    {!inCurMonth && (
                      <span className="text-[7.5px] font-bold opacity-75 leading-none">thg {format(day, 'M')}</span>
                    )}

                    {count > 0 ? (
                      <span
                        className={`text-[8.5px] font-black px-1.5 py-0.2 rounded-full leading-tight mt-0.5 ${
                          isSel
                            ? 'bg-white text-cyan-800'
                            : info?.active && info.active > 0
                            ? 'bg-emerald-500 text-white'
                            : 'bg-cyan-600 text-white'
                        }`}
                      >
                        {count} đơn
                      </span>
                    ) : (
                      <span className="text-[9px] text-transparent leading-tight select-none">•</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DAY AGENDA FOCUS */}
          <div className="space-y-3">
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-700 block">
                  Lịch Ngày Đang Chọn
                </span>
                <h4 className="text-base font-black text-slate-900 capitalize">
                  {format(selectedDay, 'EEEE, dd/MM/yyyy', { locale: vi })}
                </h4>
              </div>

              {onOpenNewBookingWithDate && (
                <button
                  type="button"
                  onClick={() => onOpenNewBookingWithDate(selectedDay)}
                  className="rounded-xl bg-cyan-600 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs hover:bg-cyan-700 transition"
                >
                  + Tạo đơn ngày này
                </button>
              )}
            </div>

            {activeBookingsForSelectedDay.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs text-xs text-slate-500">
                Không có đơn thuê nào vào ngày này.
              </div>
            ) : (
              <div className="space-y-3">
                {activeBookingsForSelectedDay.map((b) => renderBookingCard(b, selectedDay))}
              </div>
            )}
          </div>

          {/* CHRONOLOGICAL GROUPED MONTH LIST */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-emerald-600" />
              <span>Toàn Bộ Đơn Thuê Trong Tháng Theo Thứ Tự Ngày ({allMonthSortedBookings.length} đơn)</span>
            </h4>

            {monthBookingsGroupedByDay.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs text-xs text-slate-500">
                Chưa có đơn thuê nào trong tháng này.
              </div>
            ) : (
              <div className="space-y-4">
                {monthBookingsGroupedByDay.map((group) => {
                  const isCur = isToday(group.day);
                  return (
                    <div key={group.dateStr} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${isCur ? 'bg-cyan-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        <span className="text-xs sm:text-sm font-black text-slate-900 capitalize">
                          {format(group.day, 'EEEE, dd/MM/yyyy', { locale: vi })}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          ({group.bookings.length} đơn)
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {group.bookings.map((b) => renderBookingCard(b, group.day))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. IN-APP DELETE BOOKING MODAL */}
      <DeleteConfirmModal
        isOpen={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
        onConfirm={handleConfirmDeleteBooking}
        title="Xác nhận xóa đơn thuê"
        itemName={
          deletingBooking
            ? `${deletingBooking.booking_code} (${customerMap.get(deletingBooking.customer_id)?.name || 'Khách'})`
            : ''
        }
        itemType="đơn thuê"
        description="Đơn thuê này và tất cả các mục thiết bị, bút toán giao dịch liên quan sẽ bị xóa vĩnh viễn khỏi hệ thống."
        confirmButtonText="Xác nhận xóa đơn"
      />
    </div>
  );
};
