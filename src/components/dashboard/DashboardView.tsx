import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Camera,
  CalendarCheck,
  TrendingUp,
  ShieldAlert,
  Users,
  PlusCircle,
  Clock,
  ArrowRight,
  Database,
  ArrowUpRight,
  Shield,
  Layers,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { formatVND, formatDateTimeVN, STORE_OWNER } from '../../utils/formatters.ts';
import { calculateFinancialSummary } from '../../utils/financials.ts';

interface DashboardViewProps {
  onNavigate: (tab: 'dashboard' | 'equipment' | 'bookings' | 'customers' | 'finance' | 'backup') => void;
  onOpenNewBooking: () => void;
  onOpenNewEquipment: () => void;
  onSelectBooking: (bookingId: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewBooking,
  onOpenNewEquipment,
  onSelectBooking,
}) => {
  const equipment = useLiveQuery(() => db.equipment.toArray()) || [];
  const bookings = useLiveQuery(() => db.bookings.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];

  const totalEquipment = equipment.length;
  const availableEquipment = equipment.filter((e) => e.status === 'available').length;
  const rentedEquipment = equipment.filter((e) => e.status === 'rented').length;
  const maintenanceEquipment = equipment.filter((e) => e.status === 'maintenance').length;

  const activeBookings = bookings.filter((b) => b.status === 'active');
  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed');

  const financials = calculateFinancialSummary(transactions);

  const customerMap = React.useMemo(() => {
    return new Map(customers.map((c) => [c.id, c]));
  }, [customers]);

  const upcomingReturns = [...activeBookings].sort(
    (a, b) => new Date(a.end_at).getTime() - new Date(b.end_at).getTime()
  );

  const upcomingHandovers = [...confirmedBookings].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  return (
    <div className="space-y-6 text-slate-800">
      {/* Top Welcome & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs uppercase font-bold tracking-wider text-cyan-700">
              Cơ sở cho thuê: {STORE_OWNER.name} • {STORE_OWNER.phone}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Tổng quan Quản lý Thuê máy
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Dữ liệu offline tức thì, kiểm tra chống trùng lịch tự động.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenNewBooking}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Tạo đơn thuê mới</span>
          </button>
          <button
            onClick={() => onNavigate('bookings')}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition shadow-2xs"
          >
            <Layers className="w-4 h-4 text-cyan-600" />
            <span>Xem Timeline tháng</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Kho máy */}
        <GlassCard
          variant="interactive"
          onClick={() => onNavigate('equipment')}
          className="relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Kho Thiết bị</span>
            <div className="rounded-xl bg-cyan-100 p-2 text-cyan-700">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">{availableEquipment}</span>
            <span className="text-xs text-slate-500 font-semibold">/ {totalEquipment} sẵn sàng</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-2">
            <span className="text-amber-700 font-bold">{rentedEquipment} đang cho thuê</span>
            <span>•</span>
            <span className="text-rose-700 font-bold">{maintenanceEquipment} bảo trì</span>
          </div>
        </GlassCard>

        {/* Đơn đang thuê */}
        <GlassCard
          variant="interactive"
          onClick={() => onNavigate('bookings')}
          className="relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Đơn Hoạt Động</span>
            <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-600">{activeBookings.length}</span>
            <span className="text-xs text-slate-500 font-semibold">đang thuê ngoài</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            <span className="text-blue-700 font-bold">{confirmedBookings.length} đơn</span> đã chốt chờ giao
          </div>
        </GlassCard>

        {/* Doanh thu thuần */}
        <GlassCard
          variant="interactive"
          onClick={() => onNavigate('finance')}
          className="relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Doanh thu Thuê</span>
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
              {formatVND(financials.totalRevenue)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Lợi nhuận thuần:</span>
            <span className="font-bold text-slate-800">{formatVND(financials.netProfit)}</span>
          </div>
        </GlassCard>

        {/* Tiền cọc đang giữ */}
        <GlassCard
          variant="interactive"
          onClick={() => onNavigate('finance')}
          className="relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Cọc Đang Giữ</span>
            <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl sm:text-2xl font-black text-indigo-700 tracking-tight">
              {formatVND(financials.currentDepositHeld)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-indigo-900 font-medium">
            Tách biệt hoàn toàn với doanh thu
          </div>
        </GlassCard>
      </div>

      {/* Main Grid: Work Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Work Queues */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cần thu hồi máy */}
          <GlassCard>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                  Thiết bị cần thu hồi / Nhận lại ({upcomingReturns.length})
                </h2>
              </div>
              <button
                onClick={() => onNavigate('bookings')}
                className="text-xs text-cyan-700 hover:text-cyan-900 flex items-center gap-1 font-bold"
              >
                Tất cả đơn <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {upcomingReturns.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Hiện không có đơn nào đang chờ nhận lại máy.
                </div>
              ) : (
                upcomingReturns.map((b) => {
                  const customer = customerMap.get(b.customer_id);
                  const isOverdue = new Date(b.end_at).getTime() < Date.now();
                  return (
                    <div
                      key={b.id}
                      onClick={() => b.id && onSelectBooking(b.id)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                        isOverdue
                          ? 'border-rose-300 bg-rose-50/70 hover:bg-rose-100/70'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {b.booking_code}
                          </span>
                          {isOverdue && (
                            <span className="rounded bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 animate-pulse">
                              QUÁ HẠN TRẢ
                            </span>
                          )}
                          <span className="text-xs text-slate-700">
                            Khách: <strong className="text-slate-900 font-bold">{customer?.name}</strong>
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span>Dự kiến trả:</span>
                          <strong className={isOverdue ? 'text-rose-700' : 'text-slate-800'}>
                            {formatDateTimeVN(b.end_at)}
                          </strong>
                          <span>•</span>
                          <span>Cọc thế chân: {formatVND(b.deposit_security_received || b.deposit_received)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-emerald-700">
                          {formatVND(b.total_rent)}
                        </span>
                        <button className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-cyan-600 hover:text-white transition">
                          Kiểm máy & Trả cọc
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>

          {/* Sắp bàn giao */}
          <GlassCard>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                  Đơn đã chốt sắp bàn giao ({upcomingHandovers.length})
                </h2>
              </div>
              <button
                onClick={() => onNavigate('bookings')}
                className="text-xs text-cyan-700 hover:text-cyan-900 flex items-center gap-1 font-bold"
              >
                Xem timeline <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {upcomingHandovers.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Không có đơn nào sắp giao trong hôm nay.
                </div>
              ) : (
                upcomingHandovers.map((b) => {
                  const customer = customerMap.get(b.customer_id);
                  return (
                    <div
                      key={b.id}
                      onClick={() => b.id && onSelectBooking(b.id)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                            {b.booking_code}
                          </span>
                          <span className="text-xs text-slate-700">
                            Khách: <strong className="text-slate-900">{customer?.name}</strong> {customer?.phone && `(${customer.phone})`}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Thời gian nhận: <strong className="text-slate-800">{formatDateTimeVN(b.start_at)}</strong>
                        </div>
                      </div>

                      <button className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1 text-xs font-bold text-white transition">
                        Bàn giao máy
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right Column: Fast Database Stats */}
        <div className="space-y-6">
          <GlassCard variant="glow">
            <div className="flex items-center gap-2 text-cyan-700 border-b border-cyan-100 pb-3">
              <Database className="w-4 h-4" />
              <h3 className="font-bold text-slate-900 text-sm">IndexedDB Lưu Trữ Cục Bộ</h3>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Thiết bị kho:</span>
                <strong className="text-slate-900 font-mono">{equipment.length} máy</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Hồ sơ khách hàng:</span>
                <strong className="text-slate-900 font-mono">{customers.length} khách</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Lịch sử đơn thuê:</span>
                <strong className="text-slate-900 font-mono">{bookings.length} đơn</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Bút toán dòng tiền:</span>
                <strong className="text-slate-900 font-mono">{transactions.length} giao dịch</strong>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => onNavigate('backup')}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-50 border border-cyan-200 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-100 transition active:scale-95"
              >
                <span>Xuất file Excel / JSON</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </GlassCard>

          {/* Quick Nav */}
          <GlassCard>
            <h3 className="font-bold text-slate-900 text-sm mb-3">Truy cập nhanh</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onNavigate('equipment')}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-slate-800 font-medium"
              >
                <Camera className="w-4 h-4 text-cyan-600" />
                <span>Kho thiết bị</span>
              </button>
              <button
                onClick={() => onNavigate('bookings')}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-slate-800 font-medium"
              >
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Lịch Gantt</span>
              </button>
              <button
                onClick={() => onNavigate('finance')}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-slate-800 font-medium"
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Sổ quỹ</span>
              </button>
              <button
                onClick={() => onNavigate('backup')}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-slate-800 font-medium"
              >
                <Database className="w-4 h-4 text-indigo-600" />
                <span>Sao lưu</span>
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
