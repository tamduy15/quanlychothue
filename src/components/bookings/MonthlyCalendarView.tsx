import React, { useState, useMemo } from 'react';
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
  addWeeks,
  subWeeks,
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
  Phone,
  Camera,
  Search,
  Plus,
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { PopupSelect } from '../common/PopupSelect.tsx';
import { calculate24hTimelineSlots, type DayTimelineSlot } from '../../utils/timeline24h.ts';
import {
  formatVND,
  formatDateTimeVN,
  formatDateVN,
  formatTimeVN,
  BOOKING_STATUS_MAP,
} from '../../utils/formatters.ts';
import {
  formatDateTimeGAS,
  formatMoneyGAS,
  isHoldingDepositReceived,
} from '../../utils/rentalMessages.ts';
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

type FullCalendarViewMode = 'month' | 'week' | 'day' | 'list';

/**
 * Color helper matching Google Apps Script FullCalendar events:
 * - DA_GIAO_MAY (active) -> #2563eb (blue-600)
 * - DA_TRA (returned) -> #16a34a (emerald-600)
 * - GIU_LICH (confirmed) -> #111827 (slate-900)
 */
function getEventPillStyle(status: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  label: string;
} {
  if (status === 'active') {
    return {
      bg: 'bg-[#2563eb] hover:bg-blue-700',
      text: 'text-white',
      border: 'border-blue-700',
      dot: 'bg-[#2563eb]',
      badgeBg: 'bg-blue-100 border-blue-200',
      badgeText: 'text-blue-800',
      label: 'Đã giao máy',
    };
  }
  if (status === 'returned') {
    return {
      bg: 'bg-[#16a34a] hover:bg-emerald-700',
      text: 'text-white',
      border: 'border-emerald-700',
      dot: 'bg-[#16a34a]',
      badgeBg: 'bg-emerald-100 border-emerald-200',
      badgeText: 'text-emerald-800',
      label: 'Đã trả',
    };
  }
  return {
    bg: 'bg-[#111827] hover:bg-slate-800',
    text: 'text-white',
    border: 'border-slate-900',
    dot: 'bg-[#111827]',
    badgeBg: 'bg-amber-100 border-amber-200',
    badgeText: 'text-amber-900',
    label: 'Giữ lịch',
  };
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
  // FullCalendar 4 standard views: Tháng | Tuần | Ngày | Danh sách
  const [fcView, setFcView] = useState<FullCalendarViewMode>('month');
  // Focused day when clicking on a calendar cell
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  // Right sidebar tab: 'selected_day' or 'upcoming' (Lịch sắp tới like GAS index.html)
  const [sidePanelTab, setSidePanelTab] = useState<'selected_day' | 'upcoming'>('selected_day');
  // Delete confirmation modal
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

  const getMachineNameForBooking = (b: Booking): string => {
    const ids = itemsByBookingMap.get(b.id!) || [];
    const names = ids
      .map((id) => equipmentMap.get(id)?.name)
      .filter(Boolean) as string[];
    return names.length > 0 ? names.join(' + ') : b.booking_code;
  };

  // Month & Week intervals (including edge days of previous & next month)
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const calendarStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const calendarEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);

  const weeks = useMemo(() => {
    return eachWeekOfInterval(
      { start: calendarStart, end: calendarEnd },
      { weekStartsOn: 1 }
    ).map((weekStart) => ({
      weekStart,
      weekDays: eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
      }),
    }));
  }, [calendarStart, calendarEnd]);

  const activeWeekStart = useMemo(
    () => startOfWeek(selectedDay, { weekStartsOn: 1 }),
    [selectedDay]
  );
  const activeWeekEnd = useMemo(() => endOfWeek(selectedDay, { weekStartsOn: 1 }), [selectedDay]);
  const activeWeekDays = useMemo(
    () => eachDayOfInterval({ start: activeWeekStart, end: activeWeekEnd }),
    [activeWeekStart, activeWeekEnd]
  );

  // Filtered bookings (exclude cancelled unless explicitly viewing cancelled)
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter === 'all' && b.status === 'cancelled') return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      if (selectedEquipmentFilter !== 'all') {
        const itemIds = itemsByBookingMap.get(b.id!) || [];
        if (!itemIds.includes(selectedEquipmentFilter)) return false;
      }

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
    selectedEquipmentFilter,
    searchQuery,
    customerMap,
    equipmentMap,
    itemsByBookingMap,
  ]);

  // Navigation handlers depending on active FullCalendar view mode
  const handlePrev = () => {
    if (fcView === 'month' || fcView === 'list') {
      const next = subMonths(currentDate, 1);
      setCurrentDate(next);
    } else if (fcView === 'week') {
      const next = subWeeks(selectedDay, 1);
      setSelectedDay(next);
      setCurrentDate(next);
    } else {
      const next = subDays(selectedDay, 1);
      setSelectedDay(next);
      setCurrentDate(next);
    }
  };

  const handleNext = () => {
    if (fcView === 'month' || fcView === 'list') {
      const next = addMonths(currentDate, 1);
      setCurrentDate(next);
    } else if (fcView === 'week') {
      const next = addWeeks(selectedDay, 1);
      setSelectedDay(next);
      setCurrentDate(next);
    } else {
      const next = addDays(selectedDay, 1);
      setSelectedDay(next);
      setCurrentDate(next);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now);
    setSidePanelTab('selected_day');
  };

  // Dynamic Title like FullCalendar toolbar title
  const toolbarTitle = useMemo(() => {
    if (fcView === 'month' || fcView === 'list') {
      return `Tháng ${format(currentDate, 'M, yyyy')}`;
    }
    if (fcView === 'week') {
      return `${format(activeWeekStart, 'dd/MM')} – ${format(activeWeekEnd, 'dd/MM/yyyy')}`;
    }
    return format(selectedDay, "EEEE, dd/MM/yyyy", { locale: vi });
  }, [fcView, currentDate, activeWeekStart, activeWeekEnd, selectedDay]);

  // Events for a specific day
  const getDaySlots = (day: Date): DayTimelineSlot[] => {
    return calculate24hTimelineSlots(filteredBookings, day);
  };

  // Bookings for selectedDay
  const selectedDayBookings = useMemo(() => {
    const dStart = new Date(
      selectedDay.getFullYear(),
      selectedDay.getMonth(),
      selectedDay.getDate(),
      0,
      0,
      0
    );
    const dEnd = new Date(
      selectedDay.getFullYear(),
      selectedDay.getMonth(),
      selectedDay.getDate(),
      23,
      59,
      59
    );

    return filteredBookings
      .filter((b) => {
        const s = parseISO(b.start_at);
        const e = parseISO(b.end_at);
        return s <= dEnd && e >= dStart;
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [selectedDay, filteredBookings]);

  // "Lịch sắp tới" exactly like renderUpcoming() in user's Google Apps Script index.html
  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return [...filteredBookings]
      .filter((b) => b.status !== 'cancelled' && new Date(b.end_at) >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 12);
  }, [filteredBookings]);

  // Bookings grouped by day for List View ('Danh sách')
  const listGroupedByDay = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const groups: { day: Date; bookings: Booking[] }[] = [];

    for (const day of days) {
      const dStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
      const dEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
      const list = filteredBookings
        .filter((b) => {
          const s = parseISO(b.start_at);
          const e = parseISO(b.end_at);
          return s <= dEnd && e >= dStart;
        })
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

      if (list.length > 0) {
        groups.push({ day, bookings: list });
      }
    }
    return groups;
  }, [monthStart, monthEnd, filteredBookings]);

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

  // Render clean rent-card matching renderUpcoming() in Google Apps Script index.html
  const renderRentCard = (b: Booking) => {
    const cust = customerMap.get(b.customer_id);
    const machineName = getMachineNameForBooking(b);
    const pillStyle = getEventPillStyle(b.status);
    const daNhanCoc = isHoldingDepositReceived(b);

    return (
      <div
        key={b.id}
        onClick={() => b.id && onSelectBooking(b.id)}
        className="group rounded-2xl border border-[#d9e5f5] bg-gradient-to-b from-white to-[#f9fbff] p-3.5 shadow-2xs hover:border-[#0068ff] hover:shadow-md transition cursor-pointer"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-extrabold text-xs sm:text-sm text-[#10233f] truncate">
              {machineName} • {cust?.name || 'Khách thuê'}
            </div>
            <div className="text-[11px] text-[#667a99] font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                {b.booking_code}
              </span>
              {cust?.phone && <span>• SĐT: {cust.phone}</span>}
            </div>
          </div>

          <span
            className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${pillStyle.badgeBg} ${pillStyle.badgeText}`}
          >
            {pillStyle.label}
          </span>
        </div>

        <div className="mt-2 text-xs text-[#667a99] font-medium flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[#0068ff] shrink-0" />
          <span>
            {formatDateTimeGAS(b.start_at)} → {formatDateTimeGAS(b.end_at)}
          </span>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <div className="text-[#667a99] font-medium">
            Cọc giữ lịch:{' '}
            <strong className="text-slate-800">
              {formatMoneyGAS(b.deposit_holding_required || 0)}
            </strong>{' '}
            <span className={daNhanCoc ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
              {daNhanCoc ? '✓ đã nhận' : '• chưa nhận'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-extrabold text-emerald-700 text-xs">
              {formatMoneyGAS(b.total_rent)}
            </span>
            {cust?.phone && (
              <a
                href={`tel:${cust.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                title={`Gọi ${cust.phone}`}
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeletingBooking(b);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
              title="Xóa lịch"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* MAIN SPLIT LAYOUT: LEFT = CALENDAR PANEL (1.65fr), RIGHT = UPCOMING & SELECTED DAY (0.75fr) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ====================================================================
            LEFT COLUMN: FULLCALENDAR-STYLE PANEL (8 COLS ON XL)
        ==================================================================== */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-[#d9e5f5] shadow-sm p-3 sm:p-5 space-y-3.5">
          {/* 1. Calendar Top Header & Filters (like .panel-head in index.html) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#10233f] tracking-tight">
                Lịch cho thuê theo máy
              </h2>
              <p className="text-xs text-[#667a99]">
                Bấm vào ngày để xem/tạo lịch mới, bấm vào lịch để xem chi tiết & copy tin nhắn
              </p>
            </div>

            {/* Machine Filter + Search */}
            <div className="flex flex-wrap items-center gap-2">
              <PopupSelect
                value={selectedEquipmentFilter}
                onChange={(val) =>
                  setSelectedEquipmentFilter(val === 'all' ? 'all' : Number(val))
                }
                searchable={equipment.length > 4}
                searchPlaceholder="Tìm máy ảnh..."
                className="w-44 sm:w-52"
                dropdownWidthClass="w-64"
                options={[
                  {
                    value: 'all',
                    label: `Tất cả máy (${equipment.length})`,
                  },
                  ...equipment.map((eq) => ({
                    value: eq.id!,
                    label: eq.name,
                    sublabel: `Mã: ${eq.asset_code}`,
                  })),
                ]}
              />

              <div className="relative flex-1 sm:w-44 min-w-[140px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm khách, máy..."
                  className="w-full rounded-xl border border-[#d9e5f5] bg-[#f8fbff] pl-8 pr-7 py-2 text-xs font-semibold text-[#10233f] placeholder-slate-400 focus:bg-white focus:border-[#0068ff] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. FullCalendar Toolbar: Prev / Next / Hôm nay | Title | Tháng / Tuần / Ngày / Danh sách */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Left: prev, next, today */}
            <div className="flex items-center justify-between sm:justify-start gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-2 rounded-xl border border-[#d9e5f5] bg-[#edf4ff] hover:bg-[#dceaff] text-[#16325c] transition active:scale-95"
                  title="Trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="p-2 rounded-xl border border-[#d9e5f5] bg-[#edf4ff] hover:bg-[#dceaff] text-[#16325c] transition active:scale-95"
                  title="Tiếp"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-3 py-1.5 rounded-xl border border-[#d9e5f5] bg-[#edf4ff] hover:bg-[#dceaff] text-[#16325c] text-xs font-extrabold transition active:scale-95"
                >
                  Hôm nay
                </button>
              </div>

              {/* Center Title on Mobile */}
              <h3 className="sm:hidden text-sm font-black text-[#10233f] capitalize">
                {toolbarTitle}
              </h3>
            </div>

            {/* Center Title on Desktop */}
            <h3 className="hidden sm:block text-base sm:text-lg font-black text-[#10233f] capitalize text-center">
              {toolbarTitle}
            </h3>

            {/* Right: Tháng | Tuần | Ngày | Danh sách */}
            <div className="grid grid-cols-4 sm:flex items-center bg-[#edf4ff] p-1 rounded-xl border border-[#d9e5f5] gap-1">
              {(
                [
                  { id: 'month', label: 'Tháng' },
                  { id: 'week', label: 'Tuần' },
                  { id: 'day', label: 'Ngày' },
                  { id: 'list', label: 'Danh sách' },
                ] as { id: FullCalendarViewMode; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFcView(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition text-center ${
                    fcView === tab.id
                      ? 'bg-[#0068ff] text-white shadow-2xs'
                      : 'text-[#16325c] hover:bg-white/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Status Legend & Filter Chips (Giữ lịch #111827 | Đã giao máy #2563eb | Đã trả #16a34a) */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-0.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                  statusFilter === 'all'
                    ? 'bg-[#0068ff] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() =>
                  setStatusFilter(statusFilter === 'confirmed' ? 'all' : 'confirmed')
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                  statusFilter === 'confirmed'
                    ? 'bg-[#111827] text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#111827]"></span>
                <span>Giữ lịch</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                  statusFilter === 'active'
                    ? 'bg-[#2563eb] text-white'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#2563eb]"></span>
                <span>Đã giao máy</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'returned' ? 'all' : 'returned')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                  statusFilter === 'returned'
                    ? 'bg-[#16a34a] text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#16a34a]"></span>
                <span>Đã trả</span>
              </button>
            </div>

            <span className="text-[11px] text-[#667a99] hidden sm:inline font-medium">
              Lưới hiển thị: {format(calendarStart, 'dd/MM')} → {format(calendarEnd, 'dd/MM/yyyy')}
            </span>
          </div>

          {/* ==================================================================
              VIEW A: THÁNG (ROW-BASED WEEK LAYOUT WITH CONTINUOUS MULTI-DAY BARS)
          ================================================================== */}
          {fcView === 'month' && (
            <div className="rounded-2xl border border-[#d9e5f5] overflow-hidden bg-white">
              {/* 7 Weekday Headers */}
              <div className="grid grid-cols-7 border-b border-[#d9e5f5] bg-[#f4f8ff] text-center text-[11px] sm:text-xs font-extrabold text-[#16325c]">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                  <div key={d} className="py-2 border-r last:border-r-0 border-[#d9e5f5]">
                    {d}
                  </div>
                ))}
              </div>

              {/* Weeks Grid: Each Week is a 2-Layer Row */}
              <div className="divide-y divide-[#d9e5f5]">
                {weeks.map(({ weekStart, weekDays }) => {
                  const weekStartBoundary = new Date(
                    weekDays[0].getFullYear(),
                    weekDays[0].getMonth(),
                    weekDays[0].getDate(),
                    0,
                    0,
                    0,
                    0
                  );
                  const weekEndBoundary = new Date(
                    weekDays[6].getFullYear(),
                    weekDays[6].getMonth(),
                    weekDays[6].getDate(),
                    23,
                    59,
                    59,
                    999
                  );

                  // Find all bookings overlapping this week
                  const weekOverlapping = filteredBookings.filter((b) => {
                    const bStart = parseISO(b.start_at);
                    const bEnd = parseISO(b.end_at);
                    return bStart <= weekEndBoundary && bEnd >= weekStartBoundary;
                  });

                  interface WeekBarSegment {
                    booking: Booking;
                    startCol: number; // 1..7
                    endCol: number;   // 1..7
                    span: number;     // 1..7
                    startsInThisWeek: boolean;
                    endsInThisWeek: boolean;
                    laneIndex: number;
                  }

                  const rawSegments = weekOverlapping.map((b) => {
                    const bStart = parseISO(b.start_at);
                    const bEnd = parseISO(b.end_at);

                    const startsInThisWeek = bStart >= weekStartBoundary;
                    const endsInThisWeek = bEnd <= weekEndBoundary;

                    let startCol = 1;
                    if (startsInThisWeek) {
                      const idx = weekDays.findIndex((d) => isSameDay(d, bStart));
                      startCol = idx !== -1 ? idx + 1 : 1;
                    }

                    let endCol = 7;
                    if (endsInThisWeek) {
                      const idx = weekDays.findIndex((d) => isSameDay(d, bEnd));
                      endCol = idx !== -1 ? idx + 1 : 7;
                    }

                    if (endCol < startCol) endCol = startCol;
                    const span = Math.max(1, endCol - startCol + 1);

                    return {
                      booking: b,
                      startCol,
                      endCol,
                      span,
                      startsInThisWeek,
                      endsInThisWeek,
                    };
                  });

                  // Sort for optimal horizontal lane packing:
                  // 1. Earlier start column first (continuations from prev week at col 1 prioritized)
                  // 2. Longer multi-day span first
                  // 3. Earlier actual start timestamp
                  rawSegments.sort((a, b) => {
                    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
                    if (b.span !== a.span) return b.span - a.span;
                    return (
                      parseISO(a.booking.start_at).getTime() -
                      parseISO(b.booking.start_at).getTime()
                    );
                  });

                  // Allocate strict horizontal lanes (row 1, row 2, ...) so bars never jump up/down across days
                  const lanesOccupancy: boolean[][] = [];
                  const placedSegments: WeekBarSegment[] = [];

                  for (const seg of rawSegments) {
                    let assignedLane = -1;
                    for (let l = 0; l < lanesOccupancy.length; l++) {
                      let canFit = true;
                      for (let c = seg.startCol - 1; c <= seg.endCol - 1; c++) {
                        if (lanesOccupancy[l][c]) {
                          canFit = false;
                          break;
                        }
                      }
                      if (canFit) {
                        assignedLane = l;
                        break;
                      }
                    }

                    if (assignedLane === -1) {
                      assignedLane = lanesOccupancy.length;
                      lanesOccupancy.push(Array(7).fill(false));
                    }

                    for (let c = seg.startCol - 1; c <= seg.endCol - 1; c++) {
                      lanesOccupancy[assignedLane][c] = true;
                    }

                    placedSegments.push({
                      ...seg,
                      laneIndex: assignedLane,
                    });
                  }

                  return (
                    <div
                      key={weekStart.toISOString()}
                      className="relative min-h-[92px] sm:min-h-[118px]"
                    >
                      {/* LAYER 1 (BOTTOM): 7 Day Cells Grid (Numbers, Borders & Click Target) */}
                      <div className="absolute inset-0 grid grid-cols-7 divide-x divide-[#d9e5f5]">
                        {weekDays.map((day) => {
                          const inCurrentMonth = isSameMonth(day, currentDate);
                          const isCurrentDay = isToday(day);
                          const isSelected = isSameDay(day, selectedDay);

                          const dayNumberLabel =
                            !inCurrentMonth || day.getDate() === 1
                              ? format(day, 'd/M')
                              : format(day, 'd');

                          return (
                            <div
                              key={day.toISOString()}
                              onClick={() => {
                                setSelectedDay(day);
                                setSidePanelTab('selected_day');
                              }}
                              className={`h-full p-1 sm:p-1.5 flex flex-col justify-between transition cursor-pointer select-none relative group ${
                                isSelected
                                  ? 'bg-[#edf4ff] ring-2 ring-[#0068ff] ring-inset z-10'
                                  : isCurrentDay
                                  ? 'bg-amber-50/40'
                                  : !inCurrentMonth
                                  ? 'bg-slate-50/75 text-slate-400 hover:bg-slate-100/70'
                                  : 'bg-white hover:bg-[#f8fbff]'
                              }`}
                            >
                              {/* Cell Header: Date Number + Quick Add Button on Hover */}
                              <div className="flex items-center justify-between gap-0.5">
                                <span
                                  className={`text-[11px] sm:text-xs font-extrabold leading-none px-1 py-0.5 rounded-md ${
                                    isCurrentDay
                                      ? 'bg-[#0068ff] text-white font-black shadow-2xs'
                                      : !inCurrentMonth
                                      ? 'text-slate-400 font-bold'
                                      : isSelected
                                      ? 'text-[#0068ff] font-black'
                                      : 'text-[#10233f]'
                                  }`}
                                >
                                  {dayNumberLabel}
                                </span>

                                {/* Quick + button on desktop hover */}
                                {onOpenNewBookingWithDate && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenNewBookingWithDate(day);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 hidden sm:flex items-center justify-center w-5 h-5 rounded-md bg-[#edf4ff] hover:bg-[#0068ff] text-[#0068ff] hover:text-white transition text-xs font-black relative z-20"
                                    title={`Tạo lịch thuê ngày ${formatDateVN(day)}`}
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* LAYER 2 (TOP): Continuous Multi-day Event Bars Container (grid-cols-7, pointer-events-none) */}
                      <div className="relative z-10 pointer-events-none pt-7 sm:pt-8 pb-2 grid grid-cols-7 gap-y-1 auto-rows-max min-h-[92px] sm:min-h-[118px]">
                        {placedSegments.map((seg) => {
                          const b = seg.booking;
                          const cust = customerMap.get(b.customer_id);
                          const machineName = getMachineNameForBooking(b);
                          const pill = getEventPillStyle(b.status);
                          const bStart = parseISO(b.start_at);
                          const bEnd = parseISO(b.end_at);

                          const startTimeStr = format(bStart, 'HH:mm');
                          const endTimeStr = format(bEnd, 'HH:mm');
                          const isMultiDay = !isSameDay(bStart, bEnd);

                          // Border radius & margin rules when spanning across weeks:
                          // - Starts in this week: rounded-l-md + left margin
                          // - Ends in this week: rounded-r-md + right margin
                          // - Wraps to prev/next week: square edge (rounded-l-none / rounded-r-none) & 0 margin at boundary
                          const radiusAndMarginClass = [
                            seg.startsInThisWeek ? 'rounded-l-md ml-1' : 'rounded-l-none ml-0',
                            seg.endsInThisWeek ? 'rounded-r-md mr-1' : 'rounded-r-none mr-0',
                          ].join(' ');

                          return (
                            <div
                              key={`${b.id}-${weekStart.toISOString()}`}
                              style={{
                                gridColumn: `${seg.startCol} / span ${seg.span}`,
                                gridRow: seg.laneIndex + 1,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (b.id) onSelectBooking(b.id);
                              }}
                              title={`${machineName} • ${cust?.name || 'Khách'} (${formatDateTimeGAS(b.start_at)} → ${formatDateTimeGAS(b.end_at)})`}
                              className={`pointer-events-auto cursor-pointer px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9.5px] sm:text-[11px] font-bold truncate transition shadow-2xs flex items-center justify-between gap-1 select-none ${pill.bg} ${pill.text} ${radiusAndMarginClass}`}
                            >
                              <div className="flex items-center gap-1 truncate min-w-0">
                                {!seg.startsInThisWeek && (
                                  <span className="opacity-80 font-mono text-[9px] shrink-0">
                                    ◀
                                  </span>
                                )}
                                {seg.startsInThisWeek && (
                                  <span className="opacity-90 font-mono text-[9px] sm:text-[10px] shrink-0">
                                    {startTimeStr}
                                  </span>
                                )}
                                <span className="truncate font-extrabold">{machineName}</span>
                                <span className="hidden sm:inline truncate opacity-95">
                                  • {cust?.name || 'Khách'}
                                </span>
                              </div>

                              {/* Show return time or continuation arrow on the right end */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {isMultiDay && seg.endsInThisWeek && (
                                  <span className="hidden md:inline opacity-85 font-mono text-[9.5px]">
                                    → {endTimeStr}
                                  </span>
                                )}
                                {!seg.endsInThisWeek && (
                                  <span className="opacity-80 font-mono text-[9px]">▶</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================================================================
              VIEW B: TUẦN (FULLCALENDAR WEEK VIEW - 7 DAYS SCHEDULE)
          ================================================================== */}
          {fcView === 'week' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {activeWeekDays.map((day) => {
                  const isCurrentDay = isToday(day);
                  const isSelected = isSameDay(day, selectedDay);
                  const daySlots = getDaySlots(day);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={`rounded-2xl border p-2.5 transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#0068ff] bg-[#f4f8ff] shadow-xs'
                          : isCurrentDay
                          ? 'border-blue-300 bg-blue-50/30'
                          : 'border-[#d9e5f5] bg-white hover:border-blue-200'
                      }`}
                    >
                      <div>
                        {/* Day Header */}
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                                isCurrentDay
                                  ? 'bg-[#0068ff] text-white'
                                  : 'bg-slate-100 text-[#10233f]'
                              }`}
                            >
                              {format(day, 'd')}
                            </span>
                            <div>
                              <div className="text-xs font-extrabold text-[#10233f] capitalize">
                                {format(day, 'EEEE', { locale: vi })}
                              </div>
                              <div className="text-[10px] text-[#667a99]">
                                {format(day, 'dd/MM/yyyy')}
                              </div>
                            </div>
                          </div>

                          {onOpenNewBookingWithDate && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenNewBookingWithDate(day);
                              }}
                              className="px-2 py-1 rounded-lg bg-[#edf4ff] hover:bg-[#0068ff] text-[#0068ff] hover:text-white text-[10px] font-extrabold transition"
                            >
                              + Thêm
                            </button>
                          )}
                        </div>

                        {/* Day Events */}
                        {daySlots.length === 0 ? (
                          <div className="py-4 text-center text-[11px] text-slate-400">
                            Trống lịch
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {daySlots.map((slot) => {
                              const b = slot.booking;
                              const cust = customerMap.get(b.customer_id);
                              const machineName = getMachineNameForBooking(b);
                              const pill = getEventPillStyle(b.status);

                              return (
                                <div
                                  key={b.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (b.id) onSelectBooking(b.id);
                                  }}
                                  className={`rounded-xl p-2 text-xs transition shadow-2xs ${pill.bg} ${pill.text}`}
                                >
                                  <div className="font-extrabold truncate">
                                    {machineName} • {cust?.name || 'Khách'}
                                  </div>
                                  <div className="text-[10px] opacity-90 mt-0.5 font-mono">
                                    {slot.startsOnThisDay ? slot.startTimeStr : '00:00'} → {slot.endsOnThisDay ? slot.endTimeStr : '24:00'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================================================================
              VIEW C: NGÀY (FULLCALENDAR DAY VIEW - TIMELINE CHI TIẾT TRONG NGÀY)
          ================================================================== */}
          {fcView === 'day' && (
            <div className="rounded-2xl border border-[#d9e5f5] bg-[#f9fbff] p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#d9e5f5]">
                <div>
                  <h4 className="text-sm font-black text-[#10233f] capitalize">
                    Lịch chi tiết: {format(selectedDay, 'EEEE, dd/MM/yyyy', { locale: vi })}
                  </h4>
                  <p className="text-xs text-[#667a99]">
                    Có {selectedDayBookings.length} lượt thuê trong ngày này
                  </p>
                </div>
                {onOpenNewBookingWithDate && (
                  <button
                    type="button"
                    onClick={() => onOpenNewBookingWithDate(selectedDay)}
                    className="flex items-center gap-1 rounded-xl bg-[#0068ff] hover:bg-blue-700 text-white px-3 py-2 text-xs font-extrabold shadow-xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm lịch ngày này</span>
                  </button>
                )}
              </div>

              {selectedDayBookings.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  Chưa có lịch thuê nào trong ngày {formatDateVN(selectedDay)}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedDayBookings.map((b) => renderRentCard(b))}
                </div>
              )}
            </div>
          )}

          {/* ==================================================================
              VIEW D: DANH SÁCH (FULLCALENDAR LISTMONTH VIEW)
          ================================================================== */}
          {fcView === 'list' && (
            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {listGroupedByDay.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#c9daf2] p-8 text-center text-xs text-[#667a99]">
                  Không có lịch thuê nào trong {toolbarTitle}.
                </div>
              ) : (
                listGroupedByDay.map(({ day, bookings: dayList }) => (
                  <div
                    key={day.toISOString()}
                    className="rounded-2xl border border-[#d9e5f5] overflow-hidden bg-white"
                  >
                    <div className="bg-[#f4f8ff] px-3.5 py-2 border-b border-[#d9e5f5] flex items-center justify-between text-xs">
                      <span className="font-extrabold text-[#10233f] capitalize">
                        {format(day, 'EEEE, dd/MM/yyyy', { locale: vi })}
                      </span>
                      <span className="font-bold text-[#0068ff]">{dayList.length} lịch</span>
                    </div>
                    <div className="p-2.5 space-y-2">
                      {dayList.map((b) => renderRentCard(b))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ==================================================================
              MOBILE SELECTED DAY QUICK PANEL (Appears directly below Month Grid on mobile!)
          ================================================================== */}
          {fcView === 'month' && (
            <div className="xl:hidden rounded-2xl border border-[#d9e5f5] bg-[#f4f8ff]/80 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0068ff] block">
                    NGÀY ĐANG CHỌN TRÊN LỊCH
                  </span>
                  <h4 className="text-sm font-black text-[#10233f] capitalize">
                    {format(selectedDay, 'EEEE, dd/MM/yyyy', { locale: vi })} (
                    {selectedDayBookings.length} lịch)
                  </h4>
                </div>

                {onOpenNewBookingWithDate && (
                  <button
                    type="button"
                    onClick={() => onOpenNewBookingWithDate(selectedDay)}
                    className="flex items-center gap-1 rounded-xl bg-[#0068ff] text-white px-3 py-1.5 text-xs font-extrabold shadow-2xs active:scale-95 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo lịch</span>
                  </button>
                )}
              </div>

              {selectedDayBookings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#c9daf2] bg-white p-4 text-center text-xs text-[#667a99]">
                  Ngày {formatDateVN(selectedDay)} đang trống lịch. Bấm <strong>+ Tạo lịch</strong> để thêm đơn mới.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayBookings.map((b) => renderRentCard(b))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ====================================================================
            RIGHT COLUMN: "LỊCH SẮP TỚI" & "CHI TIẾT NGÀY" (4 COLS ON XL - LIKE GAS SPLIT PANEL)
        ==================================================================== */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-[#d9e5f5] shadow-sm p-4 sm:p-5 space-y-3.5">
          {/* Switcher between Lịch trong ngày đang chọn & Lịch sắp tới */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-[#10233f]">
                {sidePanelTab === 'upcoming'
                  ? 'Lịch sắp tới'
                  : `Lịch ngày ${format(selectedDay, 'dd/MM/yyyy')}`}
              </h2>
              <p className="text-xs text-[#667a99]">
                {sidePanelTab === 'upcoming'
                  ? 'Các lượt nhận và trả máy gần nhất'
                  : 'Bấm vào thẻ để mở chi tiết & mẫu tin nhắn'}
              </p>
            </div>

            {onOpenNewBookingWithDate && (
              <button
                type="button"
                onClick={() => onOpenNewBookingWithDate(selectedDay)}
                className="flex items-center gap-1 rounded-xl bg-[#edf4ff] hover:bg-[#0068ff] text-[#0068ff] hover:text-white px-2.5 py-1.5 text-xs font-extrabold transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm ngày này</span>
              </button>
            )}
          </div>

          {/* Toggle Pills */}
          <div className="grid grid-cols-2 bg-[#edf4ff] p-1 rounded-xl border border-[#d9e5f5] gap-1 text-xs">
            <button
              type="button"
              onClick={() => setSidePanelTab('selected_day')}
              className={`py-1.5 px-2 rounded-lg font-extrabold transition ${
                sidePanelTab === 'selected_day'
                  ? 'bg-[#0068ff] text-white shadow-2xs'
                  : 'text-[#16325c] hover:bg-white/60'
              }`}
            >
              Ngày {format(selectedDay, 'dd/MM')} ({selectedDayBookings.length})
            </button>
            <button
              type="button"
              onClick={() => setSidePanelTab('upcoming')}
              className={`py-1.5 px-2 rounded-lg font-extrabold transition ${
                sidePanelTab === 'upcoming'
                  ? 'bg-[#0068ff] text-white shadow-2xs'
                  : 'text-[#16325c] hover:bg-white/60'
              }`}
            >
              Lịch sắp tới ({upcomingBookings.length})
            </button>
          </div>

          {/* Cards List */}
          <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-0.5">
            {sidePanelTab === 'selected_day' ? (
              selectedDayBookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#c9daf2] p-6 text-center text-xs text-[#667a99]">
                  Chưa có lịch thuê trong ngày {formatDateVN(selectedDay)}.
                </div>
              ) : (
                selectedDayBookings.map((b) => renderRentCard(b))
              )
            ) : upcomingBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#c9daf2] p-6 text-center text-xs text-[#667a99]">
                Chưa có lịch thuê sắp tới.
              </div>
            ) : (
              upcomingBookings.map((b) => renderRentCard(b))
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
        onConfirm={handleConfirmDeleteBooking}
        title="Xác nhận xóa lịch thuê"
        itemName={
          deletingBooking
            ? `${deletingBooking.booking_code} (${customerMap.get(deletingBooking.customer_id)?.name || 'Khách'})`
            : ''
        }
        itemType="lịch thuê"
        description="Lịch thuê này sẽ bị xóa khỏi hệ thống."
        confirmButtonText="Xác nhận xóa"
      />
    </div>
  );
};
