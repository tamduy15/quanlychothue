import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calendar as CalendarIcon,
  List,
  Search,
  Plus,
  Clock,
  User,
  Shield,
  ArrowRight,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Camera,
  Layers,
  LayoutGrid,
  CalendarDays,
  Trash2,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { BookingModal } from './BookingModal.tsx';
import { BookingDetailModal } from './BookingDetailModal.tsx';
import { MonthlyCalendarView } from './MonthlyCalendarView.tsx';
import {
  formatVND,
  formatDateTimeVN,
  formatDateVN,
  BOOKING_STATUS_MAP,
} from '../../utils/formatters.ts';
import type { Booking, Equipment, Customer } from '../../types/index.ts';

interface BookingsViewProps {
  initialSelectedBookingId?: number | null;
  onClearSelectedBooking?: () => void;
}

export const BookingsView: React.FC<BookingsViewProps> = ({
  initialSelectedBookingId,
  onClearSelectedBooking,
}) => {
  const bookings = useLiveQuery(() => db.bookings.reverse().toArray()) || [];
  const bookingItems = useLiveQuery(() => db.booking_items.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const equipment = useLiveQuery(() => db.equipment.toArray()) || [];

  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);

  // Active view:
  // 'calendar_gantt': Mặc định hiển thị đầu tiên theo yêu cầu người dùng!
  // 'equipment_timeline': Gantt theo dòng thiết bị
  // 'list': Danh sách đơn thuê
  const [viewMode, setViewMode] = useState<'calendar_gantt' | 'equipment_timeline' | 'list'>('calendar_gantt');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipmentFilter, setSelectedEquipmentFilter] = useState<number | 'all'>('all');

  // Selected Month/Year
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialBookingDate, setInitialBookingDate] = useState<Date | undefined>(undefined);
  const [bookingToEdit, setBookingToEdit] = useState<Booking | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    initialSelectedBookingId || null
  );

  React.useEffect(() => {
    if (initialSelectedBookingId) {
      setSelectedBookingId(initialSelectedBookingId);
    }
  }, [initialSelectedBookingId]);

  // Lookup Maps
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

  // Month days calculation for equipment timeline
  const curYear = currentDate.getFullYear();
  const curMonth = currentDate.getMonth(); // 0-indexed
  const daysInMonth = useMemo(() => new Date(curYear, curMonth + 1, 0).getDate(), [curYear, curMonth]);
  const monthDaysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const goToPrevMonth = () => setCurrentDate(new Date(curYear, curMonth - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(curYear, curMonth + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const monthLabel = `Tháng ${curMonth + 1} / ${curYear}`;

  // Filter Bookings for list and equipment timeline
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }
      if (selectedEquipmentFilter !== 'all') {
        const itemIds = itemsByBookingMap.get(b.id!) || [];
        if (!itemIds.includes(selectedEquipmentFilter)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cust = customerMap.get(b.customer_id);
        const matchCode = b.booking_code.toLowerCase().includes(q);
        const matchCustName = cust?.name.toLowerCase().includes(q);
        const matchCustPhone = cust?.phone?.toLowerCase().includes(q);
        return matchCode || matchCustName || matchCustPhone;
      }
      return true;
    });
  }, [bookings, statusFilter, selectedEquipmentFilter, searchQuery, customerMap, itemsByBookingMap]);

  const handleEditFromDetail = (b: Booking) => {
    setBookingToEdit(b);
    setIsCreateModalOpen(true);
  };

  const handleOpenCreateWithDate = (date: Date) => {
    setBookingToEdit(null);
    setInitialBookingDate(date);
    setIsCreateModalOpen(true);
  };

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

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === curYear && today.getMonth() === curMonth;
  const todayDateNum = today.getDate();

  return (
    <div className="space-y-4 text-slate-800">
      {/* Top Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-cyan-600" />
            <span>Lịch thuê & Timeline Thiết bị</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Xem lịch tháng dạng Gantt trực quan: biết ngay ai thuê máy nào, từ mấy giờ đến mấy giờ.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher */}
          <div className="rounded-xl border border-slate-200 bg-white p-1 flex shadow-xs">
            <button
              onClick={() => setViewMode('calendar_gantt')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'calendar_gantt'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Gantt Lưới Tháng (Mặc định)"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Lưới tháng Gantt</span>
            </button>
            <button
              onClick={() => setViewMode('equipment_timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'equipment_timeline'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Gantt theo từng dòng thiết bị"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Gantt theo Thiết bị</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'list'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Danh sách đơn thuê"
            >
              <List className="w-3.5 h-3.5" />
              <span>Danh sách</span>
            </button>
          </div>

          <button
            onClick={() => {
              setBookingToEdit(null);
              setInitialBookingDate(undefined);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo đơn mới</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: MONTHLY CALENDAR VIEW VỚI TIMELINE GANTT (MẶC ĐỊNH ĐẦU TIÊN) */}
      {viewMode === 'calendar_gantt' && (
        <MonthlyCalendarView
          bookings={bookings}
          bookingItems={bookingItems}
          customers={customers}
          equipment={equipment}
          onSelectBooking={(id) => setSelectedBookingId(id)}
          onOpenNewBookingWithDate={handleOpenCreateWithDate}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedEquipmentFilter={selectedEquipmentFilter}
          setSelectedEquipmentFilter={setSelectedEquipmentFilter}
        />
      )}

      {/* VIEW 2: EQUIPMENT TIMELINE (GANTT THEO THIẾT BỊ) */}
      {viewMode === 'equipment_timeline' && (
        <div className="space-y-3">
          {/* Month Navigation Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevMonth}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-black text-sm text-slate-900 min-w-32 text-center uppercase tracking-wide">
                {monthLabel}
              </span>
              <button
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={goToToday}
                className="ml-2 rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"
              >
                Hôm nay
              </button>
            </div>

            {/* Status Filter Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setStatusFilter('all')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  statusFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({bookings.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  statusFilter === 'active'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                Đang thuê ({bookings.filter((b) => b.status === 'active').length})
              </button>
              <button
                onClick={() => setStatusFilter('confirmed')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  statusFilter === 'confirmed'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                }`}
              >
                Đã chốt ({bookings.filter((b) => b.status === 'confirmed').length})
              </button>
              <button
                onClick={() => setStatusFilter('returned')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  statusFilter === 'returned'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Đã trả
              </button>
            </div>
          </div>

          <GlassCard className="p-0 overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Sơ đồ Gantt theo Dòng máy — {monthLabel}
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Đã chốt
                </span>
                <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Đang thuê
                </span>
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Đã trả
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                {/* Header Days Row */}
                <div className="flex border-b border-slate-200 bg-slate-100/90 text-slate-700 text-[11px] font-bold">
                  <div className="w-48 shrink-0 p-2.5 border-r border-slate-200">
                    Thiết bị cho thuê
                  </div>
                  <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))` }}>
                    {monthDaysArray.map((dayNum) => {
                      const d = new Date(curYear, curMonth, dayNum);
                      const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      const isToday = isCurrentMonth && dayNum === todayDateNum;

                      return (
                        <div
                          key={dayNum}
                          className={`text-center py-2 border-r border-slate-200/80 ${
                            isToday
                              ? 'bg-cyan-100 text-cyan-900 font-black ring-2 ring-cyan-500 ring-inset'
                              : isWeekend
                              ? 'bg-slate-200/50 text-slate-500'
                              : ''
                          }`}
                        >
                          <div className="text-[10px] uppercase font-semibold text-slate-400">
                            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayOfWeek]}
                          </div>
                          <div className={isToday ? 'text-xs text-cyan-800' : 'text-xs text-slate-800'}>
                            {dayNum}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rows for each Equipment */}
                {equipment.map((eq) => {
                  const eqBookings = bookings.filter((b) => {
                    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
                    const itemIds = itemsByBookingMap.get(b.id!) || [];
                    return itemIds.includes(eq.id!);
                  });

                  return (
                    <div
                      key={eq.id}
                      className="flex border-b border-slate-100 hover:bg-slate-50/60 transition group min-h-[56px] relative"
                    >
                      {/* Left Equipment Header Column */}
                      <div className="w-48 shrink-0 p-2.5 border-r border-slate-200 flex flex-col justify-center bg-white z-10 shadow-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {eq.asset_code}
                          </span>
                          <span className="text-[10px] text-emerald-700 font-bold">
                            {formatVND(eq.daily_rate)}
                          </span>
                        </div>
                        <span className="font-bold text-xs text-slate-900 truncate mt-0.5">
                          {eq.name}
                        </span>
                      </div>

                      {/* Timeline Track Grid */}
                      <div
                        className="flex-1 relative grid"
                        style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))` }}
                      >
                        {/* Background Day Columns */}
                        {monthDaysArray.map((dayNum) => {
                          const d = new Date(curYear, curMonth, dayNum);
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          const isToday = isCurrentMonth && dayNum === todayDateNum;

                          return (
                            <div
                              key={dayNum}
                              className={`border-r border-slate-100 h-full ${
                                isToday ? 'bg-cyan-50/40' : isWeekend ? 'bg-slate-50/50' : ''
                              }`}
                            ></div>
                          );
                        })}

                        {/* Overlapping Booking Timeline Pill Bars */}
                        {eqBookings.map((b) => {
                          const start = new Date(b.start_at);
                          const end = new Date(b.end_at);

                          const monthStart = new Date(curYear, curMonth, 1);
                          const monthEnd = new Date(curYear, curMonth + 1, 0, 23, 59, 59);

                          if (end < monthStart || start > monthEnd) return null;

                          let startCol = start < monthStart ? 1 : start.getDate();
                          let endCol = end > monthEnd ? daysInMonth : end.getDate();

                          if (endCol < startCol) endCol = startCol;

                          const colSpan = Math.max(1, endCol - startCol + 1);
                          const customer = customerMap.get(b.customer_id);
                          const statusConfig = BOOKING_STATUS_MAP[b.status] || BOOKING_STATUS_MAP.draft;

                          return (
                            <div
                              key={b.id}
                              onClick={() => b.id && setSelectedBookingId(b.id)}
                              style={{
                                gridColumnStart: startCol,
                                gridColumnEnd: `span ${colSpan}`,
                              }}
                              className="absolute top-2 bottom-2 z-20 mx-0.5 cursor-pointer rounded-xl flex items-center shadow-xs transition-all hover:brightness-110 active:scale-[0.99]"
                            >
                              <div
                                className={`w-full h-full rounded-xl px-2.5 flex items-center justify-between text-xs font-bold truncate ${statusConfig.barBg}`}
                                title={`${b.booking_code} - Khách: ${customer?.name} (${formatDateTimeVN(b.start_at)} → ${formatDateTimeVN(b.end_at)})`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="font-black text-white truncate">
                                    {customer?.name || 'Khách'}
                                  </span>
                                  <span className="text-[10px] text-white/80 font-mono hidden sm:inline">
                                    ({b.booking_code})
                                  </span>
                                </div>
                                <span className="text-[10px] text-white/90 shrink-0 ml-1">
                                  {formatVND(b.total_rent)}
                                </span>
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
          </GlassCard>
        </div>
      )}

      {/* VIEW 3: DANH SÁCH ĐƠN THUÊ (LIST VIEW) */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo Mã đơn (BK-...), tên khách hàng, số điện thoại..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-hidden shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setStatusFilter('all')}
                className={`rounded-xl px-3 py-1.5 font-bold transition text-xs ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`rounded-xl px-3 py-1.5 font-bold transition text-xs ${
                  statusFilter === 'active'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                Đang thuê ({bookings.filter((b) => b.status === 'active').length})
              </button>
              <button
                onClick={() => setStatusFilter('confirmed')}
                className={`rounded-xl px-3 py-1.5 font-bold transition text-xs ${
                  statusFilter === 'confirmed'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                Đã chốt ({bookings.filter((b) => b.status === 'confirmed').length})
              </button>
              <button
                onClick={() => setStatusFilter('returned')}
                className={`rounded-xl px-3 py-1.5 font-bold transition text-xs ${
                  statusFilter === 'returned'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                Đã trả
              </button>
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
              <CalendarIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-800">Không tìm thấy đơn thuê nào</p>
            </div>
          ) : (
            filteredBookings.map((b) => {
              const cust = customerMap.get(b.customer_id);
              const statusConfig = BOOKING_STATUS_MAP[b.status] || BOOKING_STATUS_MAP.draft;
              const equipIds = itemsByBookingMap.get(b.id!) || [];

              return (
                <GlassCard
                  key={b.id}
                  variant="interactive"
                  onClick={() => b.id && setSelectedBookingId(b.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {b.booking_code}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${statusConfig.bg} ${statusConfig.border}`}
                        >
                          {statusConfig.label}
                        </span>
                        <span className="text-xs text-slate-700">
                          Khách: <strong className="text-slate-900 font-bold">{cust?.name}</strong> {cust?.phone && `(${cust.phone})`}
                        </span>
                      </div>

                      {/* Equipments */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {equipIds.map((eqId) => {
                          const eq = equipmentMap.get(eqId);
                          return (
                            <span
                              key={eqId}
                              className="inline-flex items-center gap-1 text-[11px] rounded-lg bg-slate-100 px-2 py-0.5 text-slate-700 border border-slate-200 font-medium"
                            >
                              <span className="font-mono text-slate-500 text-[10px]">{eq?.asset_code}</span>
                              <span>{eq?.name}</span>
                            </span>
                          );
                        })}
                      </div>

                      {/* Dates */}
                      <div className="text-xs text-slate-600 mt-2 flex items-center gap-2 flex-wrap">
                        <span>Nhận: <strong className="text-slate-900">{formatDateTimeVN(b.start_at)}</strong></span>
                        <span>→</span>
                        <span>Trả: <strong className="text-amber-700">{formatDateTimeVN(b.end_at)}</strong></span>
                      </div>
                    </div>

                    {/* Financials & Quick Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 gap-2">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-500 block">Tổng tiền thuê</span>
                        <strong className="text-emerald-700 font-bold text-sm sm:text-base">
                          {formatVND(b.total_rent)}
                        </strong>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Cọc thế chân: <span className="font-semibold text-indigo-700">{formatVND(b.deposit_security_required || b.deposit_required || 0)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingBooking(b);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-transparent hover:border-rose-200"
                        title="Xóa đơn thuê"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* Modals */}
      <BookingModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setInitialBookingDate(undefined);
        }}
        initialDate={initialBookingDate}
        bookingToEdit={bookingToEdit}
        onSaved={() => {}}
      />

      <BookingDetailModal
        isOpen={!!selectedBookingId}
        onClose={() => {
          setSelectedBookingId(null);
          if (onClearSelectedBooking) onClearSelectedBooking();
        }}
        bookingId={selectedBookingId}
        onEdit={handleEditFromDetail}
      />

      {/* Delete Booking Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingBooking}
        onClose={() => setDeletingBooking(null)}
        onConfirm={handleConfirmDeleteBooking}
        title="Xác nhận xóa đơn thuê"
        itemName={deletingBooking ? `${deletingBooking.booking_code} (${customerMap.get(deletingBooking.customer_id)?.name || 'Khách'})` : ''}
        itemType="đơn thuê"
        description="Đơn thuê này và tất cả các mục thiết bị, bút toán giao dịch liên quan sẽ bị xóa vĩnh viễn khỏi hệ thống."
        confirmButtonText="Xác nhận xóa đơn"
      />
    </div>
  );
};
