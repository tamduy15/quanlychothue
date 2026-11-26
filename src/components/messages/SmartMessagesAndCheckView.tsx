import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, addHours, addDays, parseISO } from 'date-fns';
import {
  MessageSquareText,
  CalendarCheck2,
  Copy,
  Check,
  Sparkles,
  Phone,
  Camera,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  Eye,
  Edit3,
  ShieldCheck,
  CreditCard,
  IdCard,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { DatePickerVN } from '../common/DatePickerVN.tsx';
import { PopupSelect } from '../common/PopupSelect.tsx';
import { TimePickerPopup } from '../common/TimePickerPopup.tsx';
import {
  buildRentalMessages,
  getRecommendedMessageType,
  copyTextWithToast,
  RENTAL_MESSAGE_TYPES,
  formatDateTimeGAS,
  formatMoneyGAS,
  isHoldingDepositReceived,
  isSecurityDepositReceived,
  isKeepCCCD,
  type RentalMessageKey,
} from '../../utils/rentalMessages.ts';
import { formatVND, BOOKING_STATUS_MAP } from '../../utils/formatters.ts';
import type { Booking, Equipment, Customer } from '../../types/index.ts';

interface SmartMessagesAndCheckViewProps {
  initialSubTab?: 'messages' | 'check';
  preselectedCheckMachineId?: number;
  onSelectBooking: (bookingId: number) => void;
  onOpenNewBookingPrefilled: (prefill: {
    equipmentId?: number;
    startDate?: Date;
    endDate?: Date;
  }) => void;
}

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export const SmartMessagesAndCheckView: React.FC<SmartMessagesAndCheckViewProps> = ({
  initialSubTab = 'messages',
  preselectedCheckMachineId,
  onSelectBooking,
  onOpenNewBookingPrefilled,
}) => {
  const [subTab, setSubTab] = useState<'messages' | 'check'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (preselectedCheckMachineId) {
      setSubTab('check');
      setCheckMachineId(preselectedCheckMachineId);
    }
  }, [preselectedCheckMachineId]);

  const equipment = useLiveQuery(() => db.equipment.toArray()) || [];
  const bookings = useLiveQuery(() => db.bookings.toArray()) || [];
  const bookingItems = useLiveQuery(() => db.booking_items.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const equipmentMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);

  const itemsByBookingMap = useMemo(() => {
    const map = new Map<number, Equipment[]>();
    for (const bi of bookingItems) {
      const eq = equipmentMap.get(bi.equipment_id);
      if (eq) {
        const list = map.get(bi.booking_id) || [];
        list.push(eq);
        map.set(bi.booking_id, list);
      }
    }
    return map;
  }, [bookingItems, equipmentMap]);

  // ============================================================================
  // PART 1: TIN NHẮN TỰ ĐỘNG & NHẮC LỊCH THÔNG MINH
  // ============================================================================
  const [msgFilter, setMsgFilter] = useState<
    'all' | 'unpaid_deposit' | 'confirmed' | 'active' | 'returned'
  >('all');
  const [msgSearch, setMsgSearch] = useState('');
  const [activePreviewTabByBooking, setActivePreviewTabByBooking] = useState<
    Record<number, RentalMessageKey>
  >({});
  const [customEditedText, setCustomEditedText] = useState<Record<string, string>>({});
  const [copiedBadgeKey, setCopiedBadgeKey] = useState<string | null>(null);

  const activeBookingsList = useMemo(() => {
    return bookings
      .filter((b) => b.status !== 'cancelled')
      .filter((b) => {
        if (msgFilter === 'unpaid_deposit') {
          return (
            b.status === 'confirmed' &&
            (b.deposit_holding_required || 0) > 0 &&
            !isHoldingDepositReceived(b)
          );
        }
        if (msgFilter === 'confirmed') return b.status === 'confirmed';
        if (msgFilter === 'active') return b.status === 'active';
        if (msgFilter === 'returned') return b.status === 'returned';
        return true;
      })
      .filter((b) => {
        if (!msgSearch.trim()) return true;
        const q = msgSearch.toLowerCase().trim();
        const cust = customerMap.get(b.customer_id);
        const eqs = itemsByBookingMap.get(b.id!) || [];
        const matchCode = b.booking_code.toLowerCase().includes(q);
        const matchCust =
          cust?.name.toLowerCase().includes(q) || (cust?.phone || '').toLowerCase().includes(q);
        const matchEq = eqs.some(
          (e) => e.name.toLowerCase().includes(q) || e.asset_code.toLowerCase().includes(q)
        );
        return matchCode || matchCust || matchEq;
      })
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
  }, [bookings, msgFilter, msgSearch, customerMap, itemsByBookingMap]);

  const handleCopyMessage = async (booking: Booking, key: RentalMessageKey, customText?: string) => {
    const eqs = itemsByBookingMap.get(booking.id!) || [];
    const cust = customerMap.get(booking.customer_id);
    const msgs = buildRentalMessages(booking, eqs, cust);
    const meta = RENTAL_MESSAGE_TYPES.find((m) => m.key === key);
    const textToCopy = customText !== undefined ? customText : msgs[key];

    await copyTextWithToast(
      textToCopy,
      `Đã copy "${meta?.title || 'tin nhắn'}" của khách ${cust?.name || booking.booking_code}!`
    );

    const badgeId = `${booking.id}-${key}`;
    setCopiedBadgeKey(badgeId);
    setTimeout(() => {
      setCopiedBadgeKey((prev) => (prev === badgeId ? null : prev));
    }, 2200);
  };

  // Quick patch function (like quickPatch in user's Google Apps Script index.html)
  // Automatically copies confirmation message when confirming holding deposit or handover/return!
  const handleQuickPatchBooking = async (
    booking: Booking,
    patchType:
      | 'toggle_holding_deposit'
      | 'toggle_security_deposit'
      | 'toggle_cccd_received'
      | 'toggle_rent_paid'
      | 'status_handover'
      | 'status_return'
  ) => {
    if (!booking.id) return;
    const eqs = itemsByBookingMap.get(booking.id) || [];
    const cust = customerMap.get(booking.customer_id);
    const now = new Date().toISOString();

    let updatedFields: Partial<Booking> = {};
    let autoCopyKey: RentalMessageKey | null = null;

    if (patchType === 'toggle_holding_deposit') {
      const currentReceived = isHoldingDepositReceived(booking);
      const nextVal = !currentReceived;
      const reqAmount = booking.deposit_holding_required || 100000;
      updatedFields = {
        has_received_holding_deposit: nextVal,
        deposit_holding_received: nextVal ? reqAmount : 0,
      };
      if (nextVal) {
        autoCopyKey = 'depositReceived';
      }
    } else if (patchType === 'toggle_security_deposit') {
      const currentSec = isSecurityDepositReceived(booking);
      const nextVal = !currentSec;
      const reqSec = booking.deposit_security_required || booking.deposit_required || 0;
      updatedFields = {
        has_received_security_deposit: nextVal,
        deposit_security_received: nextVal ? reqSec : 0,
        deposit_received: nextVal ? reqSec : 0,
      };
    } else if (patchType === 'toggle_cccd_received') {
      updatedFields = {
        has_received_cccd: !booking.has_received_cccd,
      };
    } else if (patchType === 'toggle_rent_paid') {
      updatedFields = {
        is_rent_paid: !booking.is_rent_paid,
      };
    } else if (patchType === 'status_handover') {
      const reqSec = booking.deposit_security_required || booking.deposit_required || 0;
      updatedFields = {
        status: 'active',
        has_received_security_deposit: true,
        deposit_security_received: reqSec,
        deposit_received: reqSec,
        has_received_cccd: isKeepCCCD(booking, eqs),
        is_rent_paid: true,
      };
      for (const eq of eqs) {
        if (eq.id) await db.equipment.update(eq.id, { status: 'rented' });
      }
      autoCopyKey = 'handedOver';
    } else if (patchType === 'status_return') {
      const secReceived = booking.deposit_security_received || booking.deposit_received || 0;
      updatedFields = {
        status: 'returned',
        actual_return_at: now,
        deposit_security_returned: secReceived,
        deposit_returned: secReceived,
      };
      for (const eq of eqs) {
        if (eq.id) await db.equipment.update(eq.id, { status: 'available' });
      }
      autoCopyKey = 'completed';
    }

    await db.bookings.update(booking.id, updatedFields);

    if (autoCopyKey) {
      const mergedBooking: Booking = { ...booking, ...updatedFields };
      const msgs = buildRentalMessages(mergedBooking, eqs, cust);
      await copyTextWithToast(
        msgs[autoCopyKey],
        `Đã cập nhật & Tự động copy tin nhắn cho khách ${cust?.name || booking.booking_code}!`
      );
      setActivePreviewTabByBooking((prev) => ({ ...prev, [booking.id!]: autoCopyKey! }));
    } else {
      window.dispatchEvent(
        new CustomEvent('cinerent-toast', {
          detail: { message: 'Đã cập nhật trạng thái lịch thuê!' },
        })
      );
    }
  };

  // ============================================================================
  // PART 2: CHECK LỊCH THUÊ NHANH (AVAILABILITY CHECKER - LIKE PAGE-CHECK IN GAS)
  // ============================================================================
  const [checkMachineId, setCheckMachineId] = useState<number | 'all'>(
    preselectedCheckMachineId || 'all'
  );
  const [checkStartDateStr, setCheckStartDateStr] = useState<string>(() =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const [checkStartTimeStr, setCheckStartTimeStr] = useState<string>('09:00');
  const [checkEndDateStr, setCheckEndDateStr] = useState<string>(() =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const [checkEndTimeStr, setCheckEndTimeStr] = useState<string>('15:00');
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);

  const checkStartDateObj = useMemo(() => {
    const [y, m, d] = checkStartDateStr.split('-').map(Number);
    const [hh, mm] = checkStartTimeStr.split(':').map(Number);
    return new Date(y || 2026, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  }, [checkStartDateStr, checkStartTimeStr]);

  const checkEndDateObj = useMemo(() => {
    const [y, m, d] = checkEndDateStr.split('-').map(Number);
    const [hh, mm] = checkEndTimeStr.split(':').map(Number);
    return new Date(y || 2026, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  }, [checkEndDateStr, checkEndTimeStr]);

  const applyCheckPreset = (hoursToAdd: number) => {
    const nextEnd =
      hoursToAdd >= 24
        ? addDays(checkStartDateObj, Math.round(hoursToAdd / 24))
        : addHours(checkStartDateObj, hoursToAdd);
    setCheckEndDateStr(format(nextEnd, 'yyyy-MM-dd'));
    setCheckEndTimeStr(format(nextEnd, 'HH:mm'));
  };

  // Evaluate availability across active machines (with bufferMinutes exactly like checkAvailability in code.gs)
  const availabilityReport = useMemo(() => {
    const isValidRange = checkEndDateObj > checkStartDateObj;
    if (!isValidRange) {
      return {
        isValidRange: false,
        durationHours: 0,
        machineReports: [],
      };
    }

    const bufferMs = (Number(bufferMinutes) || 0) * 60000;
    const startMs = checkStartDateObj.getTime();
    const endMs = checkEndDateObj.getTime();
    const durationHours = Math.round(((endMs - startMs) / 3600000) * 10) / 10;

    const targetMachines = equipment.filter((e) =>
      checkMachineId === 'all' ? e.status !== 'retired' : e.id === Number(checkMachineId)
    );

    const machineReports = targetMachines.map((m) => {
      const conflicts: Booking[] = [];
      for (const b of bookings) {
        if (b.status === 'cancelled' || b.status === 'returned') continue;
        const eqs = itemsByBookingMap.get(b.id!) || [];
        if (!eqs.some((e) => e.id === m.id)) continue;

        const rs = parseISO(b.start_at).getTime();
        const re = parseISO(b.end_at).getTime();
        if (startMs - bufferMs < re && endMs + bufferMs > rs) {
          conflicts.push(b);
        }
      }

      // Smart estimated price based on 6h / 1d / 2d pricing from code.gs
      let estimatedPrice = m.daily_rate || 0;
      let rateTierLabel = 'Giá 1 ngày';
      if (durationHours <= 6 && (m.rate_6h || 0) > 0) {
        estimatedPrice = m.rate_6h!;
        rateTierLabel = 'Gói 6 giờ';
      } else if (durationHours <= 24) {
        estimatedPrice = m.daily_rate || 0;
        rateTierLabel = 'Gói 1 ngày';
      } else if (durationHours <= 48 && (m.rate_2days || 0) > 0) {
        estimatedPrice = m.rate_2days!;
        rateTierLabel = 'Gói 2 ngày';
      } else {
        const days = Math.ceil(durationHours / 24);
        estimatedPrice = days * (m.daily_rate || 0);
        rateTierLabel = `${days} ngày`;
      }

      return {
        machine: m,
        available: conflicts.length === 0 && m.status !== 'maintenance',
        isMaintenance: m.status === 'maintenance',
        conflicts,
        estimatedPrice,
        rateTierLabel,
      };
    });

    return {
      isValidRange: true,
      durationHours,
      machineReports,
    };
  }, [
    checkStartDateObj,
    checkEndDateObj,
    bufferMinutes,
    equipment,
    checkMachineId,
    bookings,
    itemsByBookingMap,
  ]);

  return (
    <div className="space-y-5 text-slate-800">
      {/* TOP HEADER & SUB-TAB SWITCHER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 border border-blue-200">
              <Sparkles className="w-3 h-3" />
              TỰ ĐỘNG & THÔNG MINH
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            {subTab === 'messages' ? '✦ Tin Nhắn Tự Động & Nhắc Lịch' : '✓ Check Lịch Thuê Máy Ảnh'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {subTab === 'messages'
              ? 'Tự động soạn tin xác nhận cọc, nhắc nhận máy, bàn giao, nhắc trả máy và cập nhật nhanh 1 chạm.'
              : 'Chọn máy và khoảng thời gian để biết ngay máy còn trống hay đã có khách, báo giá tự động.'}
          </p>
        </div>

        {/* Mode Switcher: Tin nhắn vs Check lịch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('messages')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              subTab === 'messages'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquareText className="w-4 h-4" />
            <span>✦ Tin nhắn tự động</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('check')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              subTab === 'check'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarCheck2 className="w-4 h-4" />
            <span>✓ Check lịch trống</span>
          </button>
        </div>
      </div>

      {/* ==========================================================================
          TAB 1: TIN NHẮN TỰ ĐỘNG (MESSAGE CENTER)
      ========================================================================== */}
      {subTab === 'messages' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMsgFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition ${
                  msgFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tất cả lịch ({bookings.filter((b) => b.status !== 'cancelled').length})
              </button>

              <button
                type="button"
                onClick={() => setMsgFilter('unpaid_deposit')}
                className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition flex items-center gap-1.5 ${
                  msgFilter === 'unpaid_deposit'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>Chưa nhận cọc giữ lịch</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-black">
                  {
                    bookings.filter(
                      (b) =>
                        b.status === 'confirmed' &&
                        (b.deposit_holding_required || 0) > 0 &&
                        !isHoldingDepositReceived(b)
                    ).length
                  }
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMsgFilter('confirmed')}
                className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition ${
                  msgFilter === 'confirmed'
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                }`}
              >
                Giữ lịch / Sắp nhận ({bookings.filter((b) => b.status === 'confirmed').length})
              </button>

              <button
                type="button"
                onClick={() => setMsgFilter('active')}
                className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition ${
                  msgFilter === 'active'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                Đã giao máy ({bookings.filter((b) => b.status === 'active').length})
              </button>

              <button
                type="button"
                onClick={() => setMsgFilter('returned')}
                className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition ${
                  msgFilter === 'returned'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                Đã trả ({bookings.filter((b) => b.status === 'returned').length})
              </button>
            </div>

            <div className="relative min-w-[230px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={msgSearch}
                onChange={(e) => setMsgSearch(e.target.value)}
                placeholder="Tìm khách, SĐT, tên máy..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Message Cards Grid */}
          {activeBookingsList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 shadow-xs">
              <MessageSquareText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">Chưa có lịch thuê nào khớp bộ lọc</p>
              <p className="text-xs text-slate-500 mt-1">
                Hãy tạo lịch thuê mới hoặc chuyển sang bộ lọc khác để tạo tin nhắn tự động.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeBookingsList.map((b) => {
                const cust = customerMap.get(b.customer_id);
                const eqs = itemsByBookingMap.get(b.id!) || [];
                const machineNames =
                  eqs.length > 0 ? eqs.map((e) => e.name).join(' + ') : b.booking_code;
                const statusConfig = BOOKING_STATUS_MAP[b.status] || BOOKING_STATUS_MAP.confirmed;

                const msgs = buildRentalMessages(b, eqs, cust);
                const recommended = getRecommendedMessageType(b);
                const selectedKey: RentalMessageKey =
                  activePreviewTabByBooking[b.id!] || recommended.key;
                const selectedMeta =
                  RENTAL_MESSAGE_TYPES.find((m) => m.key === selectedKey) ||
                  RENTAL_MESSAGE_TYPES[0];

                const customKey = `${b.id}-${selectedKey}`;
                const displayMsgText =
                  customEditedText[customKey] !== undefined
                    ? customEditedText[customKey]
                    : msgs[selectedKey];

                const daNhanCocGiuLich = isHoldingDepositReceived(b);
                const daNhanCocTheChan = isSecurityDepositReceived(b);
                const giuCCCD = isKeepCCCD(b, eqs);
                const daNhanCCCD = Boolean(b.has_received_cccd);

                return (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3.5 hover:border-blue-300 transition"
                  >
                    {/* Header: Machine • Customer & Status */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                              {b.booking_code}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusConfig.bg}`}
                            >
                              {statusConfig.label}
                            </span>
                            <span className="text-[10.5px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-cyan-600" />
                              <span>Gợi ý: {recommended.reason}</span>
                            </span>
                          </div>

                          <h3 className="text-base font-black text-slate-900 mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <span className="text-blue-700">{machineNames}</span>
                            <span className="text-slate-300">•</span>
                            <span>{cust?.name || 'Khách thuê'}</span>
                          </h3>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {cust?.phone && (
                            <a
                              href={`tel:${cust.phone}`}
                              className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition"
                              title="Gọi điện cho khách"
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{cust.phone}</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => b.id && onSelectBooking(b.id)}
                            className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem đủ</span>
                          </button>
                        </div>
                      </div>

                      {/* Time & Deposit Meta Bar */}
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              {formatDateTimeGAS(b.start_at)} → {formatDateTimeGAS(b.end_at)}
                            </span>
                          </span>
                          <span className="font-bold text-emerald-700">
                            Giá thuê: {formatMoneyGAS(b.total_rent)}
                          </span>
                        </div>

                        {/* Handover & Deposit Status Summary */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-200/80 text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold border ${
                              daNhanCocGiuLich
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                          >
                            Cọc giữ lịch: {formatMoneyGAS(b.deposit_holding_required)} (
                            {daNhanCocGiuLich ? '✓ Đã nhận' : 'Chưa nhận'})
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-md font-bold border ${
                              daNhanCocTheChan
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            Cọc thế chân:{' '}
                            {formatMoneyGAS(
                              b.deposit_security_required || b.deposit_required || 0
                            )}{' '}
                            ({daNhanCocTheChan ? '✓ Đã nhận' : 'Khi giao máy'})
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-md font-bold border ${
                              daNhanCCCD
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            {daNhanCCCD ? '✓ Đã giữ CCCD & VNeID' : 'Giữ CCCD bản cứng & check VNeID'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 5 Quick Copy Buttons Bar (Familiar from index.html + Smart Preview Selector) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-600">
                          Chọn mẫu tin nhắn (Bấm để xem hoặc Copy ngay):
                        </span>
                        {b.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => handleQuickPatchBooking(b, 'status_handover')}
                            className="text-[11px] font-bold text-blue-700 hover:underline flex items-center gap-1"
                          >
                            <span>⚡ Chuyển sang Đã giao máy & Copy tin</span>
                          </button>
                        )}
                        {b.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handleQuickPatchBooking(b, 'status_return')}
                            className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                          >
                            <span>⚡ Chuyển sang Đã trả máy & Copy tin</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {RENTAL_MESSAGE_TYPES.map((mType) => {
                          const isSelected = selectedKey === mType.key;
                          const isRecommended = recommended.key === mType.key;
                          const isCopied = copiedBadgeKey === `${b.id}-${mType.key}`;

                          return (
                            <div key={mType.key} className="flex items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePreviewTabByBooking((prev) => ({
                                    ...prev,
                                    [b.id!]: mType.key,
                                  }));
                                  handleCopyMessage(b, mType.key);
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 border active:scale-95 ${
                                  isCopied
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : isSelected
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800'
                                }`}
                              >
                                {isCopied ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-80" />
                                )}
                                <span>{mType.shortLabel}</span>
                                {isRecommended && !isCopied && (
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      isSelected ? 'bg-amber-300' : 'bg-blue-500'
                                    }`}
                                    title="Mẫu tin gợi ý cho trạng thái hiện tại"
                                  />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Live Editable Message Box */}
                      <div className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black text-blue-950 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Nội dung: {selectedMeta.title}</span>
                          </span>

                          {customEditedText[customKey] !== undefined && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...customEditedText };
                                delete next[customKey];
                                setCustomEditedText(next);
                              }}
                              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Khôi phục mặc định</span>
                            </button>
                          )}
                        </div>

                        <textarea
                          rows={3}
                          value={displayMsgText}
                          onChange={(e) =>
                            setCustomEditedText((prev) => ({
                              ...prev,
                              [customKey]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-blue-200 bg-white p-2.5 text-xs text-slate-800 leading-relaxed focus:border-blue-500 focus:outline-none"
                        />

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10.5px] text-slate-500 italic">
                            Có thể sửa trực tiếp chữ trong khung trước khi bấm Copy
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyMessage(b, selectedKey, displayMsgText)}
                            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:brightness-105 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs active:scale-95 transition shrink-0"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy tin nhắn này</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          TAB 2: CHECK LỊCH THUÊ NHANH (AVAILABILITY CHECKER)
      ========================================================================== */}
      {subTab === 'check' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Panel: Check Form */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 self-start">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <CalendarCheck2 className="w-5 h-5 text-blue-600" />
                <span>Bộ Kiểm Tra Trùng Lịch & Báo Giá</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kiểm tra 1 máy cụ thể hoặc quét toàn bộ kho máy trong khung giờ khách hỏi.
              </p>
            </div>

            {/* Machine Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Chọn máy ảnh cần check
              </label>
              <PopupSelect
                value={checkMachineId}
                onChange={(val) => setCheckMachineId(val === 'all' ? 'all' : Number(val))}
                searchable={equipment.length > 0}
                searchPlaceholder="Tìm tên máy hoặc mã máy..."
                options={[
                  {
                    value: 'all',
                    label: `🔍 Quét tất cả máy ảnh trong kho (${equipment.filter((e) => e.status !== 'retired').length} máy)`,
                  },
                  ...equipment
                    .filter((e) => e.status !== 'retired')
                    .map((m) => ({
                      value: m.id!,
                      label: `${m.name} (${m.asset_code})`,
                      sublabel: `6h: ${formatMoneyGAS(m.rate_6h)} • 1 ngày: ${formatMoneyGAS(m.daily_rate)}`,
                    })),
                ]}
              />
            </div>

            {/* Pickup Date & Time (dd/mm/yyyy) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <span className="text-xs font-black text-slate-900 block">
                1. Thời gian Nhận máy (dd/mm/yyyy)
              </span>
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <DatePickerVN
                    value={checkStartDateStr}
                    onChange={(val) => setCheckStartDateStr(val)}
                    accentColor="cyan"
                  />
                </div>
                <div className="col-span-2">
                  <TimePickerPopup
                    value={checkStartTimeStr}
                    onChange={(val) => setCheckStartTimeStr(val)}
                    accentColor="cyan"
                  />
                </div>
              </div>
            </div>

            {/* Return Date & Time (dd/mm/yyyy) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  2. Thời gian Trả máy (dd/mm/yyyy)
                </span>
                <div className="flex items-center gap-1">
                  {[
                    { label: '+6 giờ', hours: 6 },
                    { label: '+1 ngày', hours: 24 },
                    { label: '+2 ngày', hours: 48 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyCheckPreset(preset.hours)}
                      className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <DatePickerVN
                    value={checkEndDateStr}
                    onChange={(val) => setCheckEndDateStr(val)}
                    accentColor="amber"
                  />
                </div>
                <div className="col-span-2">
                  <TimePickerPopup
                    value={checkEndTimeStr}
                    onChange={(val) => setCheckEndTimeStr(val)}
                    accentColor="amber"
                  />
                </div>
              </div>
            </div>

            {/* Buffer Time Setting (DEFAULT_BUFFER_MINUTES from code.gs) */}
            <div className="flex items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-slate-600 font-semibold">
                Thời gian đệm giữa 2 lượt thuê:
              </span>
              <PopupSelect
                value={bufferMinutes}
                onChange={(val) => setBufferMinutes(Number(val))}
                dropdownAlign="right"
                className="w-44"
                options={[
                  { value: 0, label: '0 phút (Sát giờ)' },
                  { value: 30, label: '30 phút kiểm máy' },
                  { value: 60, label: '60 phút (1 tiếng)' },
                  { value: 120, label: '120 phút (2 tiếng)' },
                ]}
              />
            </div>

            {/* Action Button: Create Rental with this time */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!availabilityReport.isValidRange}
                onClick={() =>
                  onOpenNewBookingPrefilled({
                    equipmentId: checkMachineId === 'all' ? undefined : Number(checkMachineId),
                    startDate: checkStartDateObj,
                    endDate: checkEndDateObj,
                  })
                }
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:brightness-105 text-white px-4 py-2.5 text-xs font-bold shadow-sm active:scale-95 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Dùng thời gian này để tạo lịch thuê</span>
              </button>
            </div>
          </div>

          {/* Right Panel: Availability Results */}
          <div className="lg:col-span-7 space-y-4">
            {!availabilityReport.isValidRange ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Thời gian trả máy phải sau thời gian nhận máy</h4>
                  <p className="text-xs mt-0.5">
                    Vui lòng chọn lại ngày/giờ trả máy lớn hơn ngày/giờ nhận máy.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Summary Banner */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">
                      Kết Quả Check Lịch ({availabilityReport.durationHours} giờ)
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                      Từ {formatDateTimeGAS(checkStartDateObj)} → {formatDateTimeGAS(checkEndDateObj)}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ✓ {availabilityReport.machineReports.filter((r) => r.available).length} máy trống
                    </span>
                    {availabilityReport.machineReports.some((r) => !r.available) && (
                      <span className="px-3 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200">
                        ✕ {availabilityReport.machineReports.filter((r) => !r.available).length} máy bận
                      </span>
                    )}
                  </div>
                </div>

                {/* Machine Results Cards */}
                <div className="space-y-3">
                  {availabilityReport.machineReports.map((rep) => {
                    const m = rep.machine;
                    return (
                      <div
                        key={m.id}
                        className={`rounded-2xl border p-4 transition shadow-2xs ${
                          rep.available
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-rose-200 bg-rose-50/40'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {rep.available ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-0.5 text-[11px] font-black text-white">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>MÁY ĐANG TRỐNG</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-0.5 text-[11px] font-black text-white">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>
                                    {rep.isMaintenance
                                      ? 'ĐANG BẢO TRÌ'
                                      : `TRÙNG ${rep.conflicts.length} LỊCH THUÊ`}
                                  </span>
                                </span>
                              )}
                              <span className="font-mono text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                                {m.asset_code}
                              </span>
                            </div>

                            <h4 className="text-base font-black text-slate-900">{m.name}</h4>

                            {/* Price Reference Grid (6h / 1d / 2d / Cọc) */}
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 pt-1">
                              <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                                6 giờ: <strong>{formatMoneyGAS(m.rate_6h)}</strong>
                              </span>
                              <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                                1 ngày: <strong>{formatMoneyGAS(m.daily_rate)}</strong>
                              </span>
                              <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                                2 ngày: <strong>{formatMoneyGAS(m.rate_2days)}</strong>
                              </span>
                              <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                                Cọc thế chân: <strong>{formatMoneyGAS(m.deposit_rate)}</strong>
                              </span>
                            </div>
                          </div>

                          {rep.available && (
                            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-emerald-200/60">
                              <div className="text-left sm:text-right">
                                <span className="text-[10px] font-bold text-emerald-800 block">
                                  Tạm tính ({rep.rateTierLabel}):
                                </span>
                                <strong className="text-base font-black text-emerald-700">
                                  {formatVND(rep.estimatedPrice)}
                                </strong>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  onOpenNewBookingPrefilled({
                                    equipmentId: m.id,
                                    startDate: checkStartDateObj,
                                    endDate: checkEndDateObj,
                                  })
                                }
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs active:scale-95 transition"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Tạo lịch máy này</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Conflict List (Just like conflicts in index.html) */}
                        {rep.conflicts.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-rose-200/80 space-y-1.5">
                            <span className="text-[11px] font-bold text-rose-900 block">
                              Các lịch đang bị trùng trong khung giờ này:
                            </span>
                            {rep.conflicts.map((conf) => {
                              const cCust = customerMap.get(conf.customer_id);
                              const cStatus =
                                BOOKING_STATUS_MAP[conf.status] || BOOKING_STATUS_MAP.confirmed;
                              return (
                                <div
                                  key={conf.id}
                                  onClick={() => conf.id && onSelectBooking(conf.id)}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-rose-200 p-2.5 text-xs cursor-pointer hover:border-rose-400 transition"
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded">
                                      {conf.booking_code}
                                    </span>
                                    <strong className="text-slate-900">
                                      {cCust?.name || 'Khách thuê'}
                                    </strong>
                                    {cCust?.phone && (
                                      <span className="text-slate-500">({cCust.phone})</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-slate-600">
                                      {formatDateTimeGAS(conf.start_at)} →{' '}
                                      {formatDateTimeGAS(conf.end_at)}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cStatus.bg}`}
                                    >
                                      {cStatus.label}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
