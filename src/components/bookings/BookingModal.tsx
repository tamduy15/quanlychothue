import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Plus,
  DollarSign,
  User,
  Shield,
  Clock,
  Sparkles,
  HelpCircle,
  Tag,
  Check,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassModal } from '../common/GlassModal.tsx';
import { DatePickerVN } from '../common/DatePickerVN.tsx';
import { findConflictingEquipment, BookingWithEquipments } from '../../utils/overlap.ts';
import {
  toDateInputValue,
  combineDateAndTime,
  calculatePresetEnd,
  generateShortBookingCode,
  TIME_SLOTS,
} from '../../utils/bookingHelpers.ts';
import { formatVND, formatDateTimeVN, formatDateVN, parseVNDateTime } from '../../utils/formatters.ts';
import type { Booking, BookingItem, Customer, Equipment, BookingStatus } from '../../types/index.ts';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedEquipmentId?: number;
  initialDate?: Date;
  bookingToEdit?: Booking | null;
  onSaved: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedEquipmentId,
  initialDate,
  bookingToEdit,
  onSaved,
}) => {
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const allEquipment = useLiveQuery(() => db.equipment.toArray()) || [];
  const allBookings = useLiveQuery(() => db.bookings.toArray()) || [];
  const allBookingItems = useLiveQuery(() => db.booking_items.toArray()) || [];

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | 'new' | ''>('');
  const [customerName, setCustomerName] = useState(''); // Bắt buộc
  const [customerPhone, setCustomerPhone] = useState(''); // Không bắt buộc
  const [customerCCCD, setCustomerCCCD] = useState('');   // Không bắt buộc

  // Date and Time State
  // Format dd/MM/yyyy HH:mm
  const [startDateStr, setStartDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('08:00');
  const [endDateStr, setEndDateStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('20:00');

  // Equipment Selection
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [equipmentTab, setEquipmentTab] = useState<'available' | 'all'>('available');

  // Pricing State - Flexible
  const [isCustomRent, setIsCustomRent] = useState(false);
  const [customRentAmount, setCustomRentAmount] = useState<number>(150000);
  const [discount, setDiscount] = useState<number>(0);
  const [extraFees, setExtraFees] = useState<number>(0);

  // 1. Cọc giữ lịch (Cọc để giữ chỗ máy - mặc định 100k, tự động đồng bộ ô Đã nhận)
  const [depositHoldingRequired, setDepositHoldingRequired] = useState<number>(100000);
  const [depositHoldingReceived, setDepositHoldingReceived] = useState<number>(100000);

  // 2. Cọc thế chân (Cọc bảo lãnh tài sản - hoàn lại khi trả máy nguyên vẹn)
  const [depositSecurityRequired, setDepositSecurityRequired] = useState<number>(500000);
  const [depositSecurityReceived, setDepositSecurityReceived] = useState<number>(0);

  const [status, setStatus] = useState<BookingStatus>('confirmed');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper date conversions
  const pad = (n: number) => String(n).padStart(2, '0');

  useEffect(() => {
    if (bookingToEdit) {
      setSelectedCustomerId(bookingToEdit.customer_id);
      const cust = customers.find((c) => c.id === bookingToEdit.customer_id);
      if (cust) {
        setCustomerName(cust.name);
        setCustomerPhone(cust.phone || '');
        setCustomerCCCD(cust.identity_card || '');
      }

      const s = new Date(bookingToEdit.start_at);
      const e = new Date(bookingToEdit.end_at);
      setStartDateStr(toDateInputValue(s));
      setStartTimeStr(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
      setEndDateStr(toDateInputValue(e));
      setEndTimeStr(`${pad(e.getHours())}:${pad(e.getMinutes())}`);

      setIsCustomRent(Boolean(bookingToEdit.is_custom_rent));
      setCustomRentAmount(bookingToEdit.total_rent || 0);
      setDiscount(bookingToEdit.discount || 0);
      setExtraFees(bookingToEdit.extra_fees || 0);

      setDepositHoldingRequired(bookingToEdit.deposit_holding_required || 0);
      setDepositHoldingReceived(bookingToEdit.deposit_holding_received || 0);
      setDepositSecurityRequired(bookingToEdit.deposit_security_required || bookingToEdit.deposit_required || 0);
      setDepositSecurityReceived(bookingToEdit.deposit_security_received || bookingToEdit.deposit_received || 0);

      setStatus(bookingToEdit.status);
      setHandoverNotes(bookingToEdit.handover_notes || '');

      const itemEquipIds = allBookingItems
        .filter((bi) => bi.booking_id === bookingToEdit.id)
        .map((bi) => bi.equipment_id);
      setSelectedEquipmentIds(itemEquipIds);
    } else {
      const now = new Date();
      const baseDate = initialDate || now;
      const returnDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);

      setStartDateStr(toDateInputValue(baseDate));
      setStartTimeStr('08:00');
      setEndDateStr(toDateInputValue(returnDate));
      setEndTimeStr('18:00');

      // Auto default to 'new' (thêm khách mới)
      setSelectedCustomerId('new');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerCCCD('');

      setSelectedEquipmentIds(preselectedEquipmentId ? [preselectedEquipmentId] : []);
      setIsCustomRent(false);
      setDiscount(0);
      setExtraFees(0);
      setDepositHoldingRequired(100000);
      setDepositHoldingReceived(100000);
      setStatus('confirmed');
      setHandoverNotes('');
    }
    setErrorMsg('');
  }, [bookingToEdit, isOpen, preselectedEquipmentId, customers]);

  // Construct valid ISO date from YYYY-MM-DD and HH:mm
  const parsedStart = useMemo(() => {
    if (!startDateStr) return null;
    return combineDateAndTime(startDateStr, startTimeStr || '08:00');
  }, [startDateStr, startTimeStr]);

  const parsedEnd = useMemo(() => {
    if (!endDateStr) return null;
    return combineDateAndTime(endDateStr, endTimeStr || '18:00');
  }, [endDateStr, endTimeStr]);

  const startAtISO = useMemo(() => (parsedStart ? parsedStart.toISOString() : ''), [parsedStart]);
  const endAtISO = useMemo(() => (parsedEnd ? parsedEnd.toISOString() : ''), [parsedEnd]);

  // Duration in hours & days
  const rentalDuration = useMemo(() => {
    if (!parsedStart || !parsedEnd || parsedEnd <= parsedStart) {
      return { hours: 24, days: 1 };
    }
    const diffHours = (parsedEnd.getTime() - parsedStart.getTime()) / (1000 * 60 * 60);
    const roundedHours = Math.round(diffHours * 10) / 10;
    const days = Math.max(1, Math.ceil(roundedHours / 24));
    return { hours: roundedHours, days };
  }, [parsedStart, parsedEnd]);

  // Quick Preset Durations
  const applyPresetDuration = (hours: number) => {
    if (!startDateStr) return;
    const res = calculatePresetEnd(startDateStr, startTimeStr || '08:00', hours);
    setEndDateStr(res.endDateStr);
    setEndTimeStr(res.endTimeStr);
  };

  // Lookup maps
  const equipmentMap = useMemo(() => {
    return new Map(allEquipment.map((e) => [e.id, e]));
  }, [allEquipment]);

  // Existing bookings with equipment for overlap checking
  const existingBookingsWithEquip: BookingWithEquipments[] = useMemo(() => {
    const itemMap = new Map<number, number[]>();
    for (const bi of allBookingItems) {
      const list = itemMap.get(bi.booking_id) || [];
      list.push(bi.equipment_id);
      itemMap.set(bi.booking_id, list);
    }

    return allBookings.map((b) => ({
      bookingId: b.id!,
      status: b.status,
      start_at: b.start_at,
      end_at: b.end_at,
      equipmentIds: itemMap.get(b.id!) || [],
    }));
  }, [allBookings, allBookingItems]);

  // Overlap conflicts check
  const conflicts = useMemo(() => {
    if (!startAtISO || !endAtISO || selectedEquipmentIds.length === 0) return [];
    return findConflictingEquipment(
      startAtISO,
      endAtISO,
      selectedEquipmentIds,
      existingBookingsWithEquip,
      bookingToEdit?.id
    );
  }, [startAtISO, endAtISO, selectedEquipmentIds, existingBookingsWithEquip, bookingToEdit]);

  // Separate equipment into Available vs Busy during selected time
  const { availableEquipList, busyEquipList } = useMemo(() => {
    if (!startAtISO || !endAtISO) {
      return { availableEquipList: allEquipment, busyEquipList: [] };
    }

    const available: Equipment[] = [];
    const busy: { equip: Equipment; conflictingBookingId: number }[] = [];

    for (const eq of allEquipment) {
      const checkConflict = findConflictingEquipment(
        startAtISO,
        endAtISO,
        [eq.id!],
        existingBookingsWithEquip,
        bookingToEdit?.id
      );

      if (checkConflict.length > 0) {
        busy.push({ equip: eq, conflictingBookingId: checkConflict[0].conflictingBookingId });
      } else {
        available.push(eq);
      }
    }

    return { availableEquipList: available, busyEquipList: busy };
  }, [allEquipment, startAtISO, endAtISO, existingBookingsWithEquip, bookingToEdit]);

  // Auto-calculated Rent based on duration & rate presets
  const autoCalculatedRent = useMemo(() => {
    let sum = 0;
    for (const eqId of selectedEquipmentIds) {
      const eq = equipmentMap.get(eqId);
      if (!eq) continue;

      if (rentalDuration.hours <= 6 && eq.rate_6h) {
        sum += eq.rate_6h;
      } else if (rentalDuration.days === 1) {
        sum += eq.daily_rate;
      } else if (rentalDuration.days === 2 && eq.rate_2days) {
        sum += eq.rate_2days;
      } else {
        sum += eq.daily_rate * rentalDuration.days;
      }
    }
    return sum;
  }, [selectedEquipmentIds, equipmentMap, rentalDuration]);

  // Auto-suggested security deposit (respect 0đ for accessories)
  const autoSecurityDeposit = useMemo(() => {
    let sum = 0;
    for (const eqId of selectedEquipmentIds) {
      const eq = equipmentMap.get(eqId);
      if (eq) sum += eq.deposit_rate ?? 0;
    }
    return sum;
  }, [selectedEquipmentIds, equipmentMap]);

  // Update default security deposit when equipment changes
  useEffect(() => {
    if (!bookingToEdit && autoSecurityDeposit > 0) {
      setDepositSecurityRequired(autoSecurityDeposit);
    }
  }, [autoSecurityDeposit, bookingToEdit]);

  // Update rent when not custom
  useEffect(() => {
    if (!isCustomRent) {
      setCustomRentAmount(autoCalculatedRent);
    }
  }, [autoCalculatedRent, isCustomRent]);

  // Final Total Rent
  const effectiveTotalRent = isCustomRent
    ? Math.max(0, Number(customRentAmount) + Number(extraFees) - Number(discount))
    : Math.max(0, Number(autoCalculatedRent) + Number(extraFees) - Number(discount));

  // Toggle Equipment Selection
  const toggleEquipment = (eqId: number) => {
    if (selectedEquipmentIds.includes(eqId)) {
      setSelectedEquipmentIds(selectedEquipmentIds.filter((id) => id !== eqId));
    } else {
      setSelectedEquipmentIds([...selectedEquipmentIds, eqId]);
    }
  };

  const handleCustomerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'new') {
      setSelectedCustomerId('new');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerCCCD('');
    } else if (val) {
      const cId = Number(val);
      setSelectedCustomerId(cId);
      const cust = customers.find((c) => c.id === cId);
      if (cust) {
        setCustomerName(cust.name);
        setCustomerPhone(cust.phone || '');
        setCustomerCCCD(cust.identity_card || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate: Customer Name is mandatory
    if (!customerName.trim()) {
      setErrorMsg('Vui lòng nhập Tên khách hàng (Bắt buộc).');
      return;
    }

    if (selectedEquipmentIds.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất 1 thiết bị cho đơn thuê.');
      return;
    }

    if (!parsedStart || !parsedEnd || parsedEnd <= parsedStart) {
      setErrorMsg('Thời gian trả máy phải sau thời gian nhận máy.');
      return;
    }

    // Strict overlap check
    if ((status === 'confirmed' || status === 'active') && conflicts.length > 0) {
      const conflictNames = conflicts
        .map((c) => equipmentMap.get(c.equipmentId)?.name || `Thiết bị #${c.equipmentId}`)
        .join(', ');
      setErrorMsg(`Không thể lưu! Thiết bị trùng lịch: ${conflictNames}. Vui lòng chọn thiết bị hoặc giờ khác.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      // 1. Resolve or create customer
      let finalCustomerId: number;
      if (selectedCustomerId !== 'new' && typeof selectedCustomerId === 'number') {
        finalCustomerId = selectedCustomerId;
        // update customer notes/phone if provided
        await db.customers.update(finalCustomerId, {
          name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
          identity_card: customerCCCD.trim() || undefined,
        });
      } else {
        finalCustomerId = await db.customers.add({
          name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
          identity_card: customerCCCD.trim() || undefined,
          trust_level: 'normal',
          created_at: new Date().toISOString(),
        });
      }

      const now = new Date();
      const bookingCode =
        bookingToEdit?.booking_code ||
        generateShortBookingCode(allBookings.map((b) => b.booking_code));

      const bookingData: Booking = {
        booking_code: bookingCode,
        customer_id: finalCustomerId,
        status,
        start_at: parsedStart.toISOString(),
        end_at: parsedEnd.toISOString(),
        total_rent: effectiveTotalRent,
        is_custom_rent: isCustomRent,
        calculated_rent: autoCalculatedRent,

        deposit_holding_required: Number(depositHoldingRequired) || 0,
        deposit_holding_received: Number(depositHoldingReceived) || 0,
        deposit_holding_returned: bookingToEdit?.deposit_holding_returned || 0,

        deposit_security_required: Number(depositSecurityRequired) || 0,
        deposit_security_received: Number(depositSecurityReceived) || 0,
        deposit_security_returned: bookingToEdit?.deposit_security_returned || 0,

        deposit_required: Number(depositSecurityRequired) || 0,
        deposit_received: Number(depositSecurityReceived) || 0,
        deposit_returned: bookingToEdit?.deposit_returned || 0,

        discount: Number(discount) || 0,
        extra_fees: Number(extraFees) || 0,
        handover_notes: handoverNotes.trim(),
        created_at: bookingToEdit?.created_at || now.toISOString(),
      };

      let bookingId = bookingToEdit?.id;

      if (bookingToEdit && bookingId) {
        await db.bookings.update(bookingId, bookingData);
        await db.booking_items.where('booking_id').equals(bookingId).delete();
      } else {
        bookingId = await db.bookings.add(bookingData);
      }

      // Add items
      const itemsToAdd: BookingItem[] = selectedEquipmentIds.map((eqId) => {
        const eq = equipmentMap.get(eqId);
        return {
          booking_id: bookingId!,
          equipment_id: eqId,
          rental_price: effectiveTotalRent / selectedEquipmentIds.length,
          condition_on_out: eq?.condition || 'Tốt',
          accessories_checklist: (eq?.accessories || []).map((acc) => ({
            name: acc,
            checked_out: true,
            checked_in: false,
          })),
        };
      });
      await db.booking_items.bulkAdd(itemsToAdd);

      // Status update
      if (status === 'active') {
        for (const eqId of selectedEquipmentIds) {
          await db.equipment.update(eqId, { status: 'rented' });
        }
      }

      // Record deposit holding transaction if received on new booking
      if (!bookingToEdit && Number(depositHoldingReceived) > 0) {
        await db.transactions.add({
          booking_id: bookingId,
          type: 'deposit_holding_in',
          amount: Number(depositHoldingReceived),
          payment_method: 'transfer',
          date: now.toISOString(),
          note: `Thu cọc giữ lịch đơn ${bookingCode} (${customerName})`,
          is_deposit: true,
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg('Lỗi lưu đơn thuê: ' + (err?.message || 'Thất bại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={bookingToEdit ? `Sửa đơn thuê: ${bookingToEdit.booking_code}` : 'Tạo Đơn Thuê Thiết Bị Mới'}
      subtitle="Tự động lọc máy trống theo giờ & Giá thuê linh động"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-800">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Overlap Conflict Banner */}
        {conflicts.length > 0 && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-800 space-y-1">
            <div className="flex items-center gap-2 font-bold text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
              <span>PHÁT HIỆN TRÙNG LỊCH THIẾT BỊ!</span>
            </div>
            <p>Thiết bị sau đã có người đặt trong thời gian này:</p>
            <ul className="list-disc list-inside space-y-0.5 font-semibold text-rose-700">
              {conflicts.map((c, i) => {
                const eq = equipmentMap.get(c.equipmentId);
                return (
                  <li key={i}>
                    {eq?.name} ({eq?.asset_code}) — Trùng với đơn #{c.conflictingBookingId}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 1. RENTAL TIME PICKER (CHỌN NGÀY & CHỌN GIỜ TRỰC QUAN) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
              <Clock className="w-4 h-4 text-cyan-600" />
              <span>Thời gian thuê máy (Chọn ngày & chọn giờ tiện lợi)</span>
            </label>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium">Gói nhanh:</span>
              <button
                type="button"
                onClick={() => applyPresetDuration(6)}
                className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-cyan-50 hover:border-cyan-300 transition"
              >
                Gói 6h
              </button>
              <button
                type="button"
                onClick={() => applyPresetDuration(24)}
                className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-cyan-50 hover:border-cyan-300 transition"
              >
                1 Ngày (24h)
              </button>
              <button
                type="button"
                onClick={() => applyPresetDuration(48)}
                className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-cyan-50 hover:border-cyan-300 transition"
              >
                2 Ngày (48h)
              </button>
              <button
                type="button"
                onClick={() => applyPresetDuration(72)}
                className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-cyan-50 hover:border-cyan-300 transition"
              >
                3 Ngày (72h)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Nhận máy */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-600"></span>
                  <span>1. Thời gian NHẬN máy</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setStartDateStr(toDateInputValue(today));
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tmr = new Date();
                      tmr.setDate(tmr.getDate() + 1);
                      setStartDateStr(toDateInputValue(tmr));
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Ngày mai
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] font-bold text-slate-500">Chọn ngày nhận:</label>
                    {startDateStr && (
                      <span className="text-[9.5px] font-black text-cyan-800 bg-cyan-50 px-1 py-0.2 rounded border border-cyan-200">
                        {formatDateVN(startDateStr)}. {startTimeStr}
                      </span>
                    )}
                  </div>
                  <DatePickerVN
                    value={startDateStr}
                    onChange={(val) => setStartDateStr(val)}
                    accentColor="cyan"
                    placeholder="dd/mm/yyyy"
                  />
                  <span className="text-[9.5px] text-slate-500 block mt-0.5">
                    Định dạng: <strong className="text-cyan-700">{startDateStr ? `${formatDateVN(startDateStr)}. ${startTimeStr}` : 'dd/mm/yyyy. hh:mm'}</strong>
                  </span>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Chọn giờ nhận:</label>
                  <select
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-cyan-500 focus:bg-white focus:outline-none shadow-xs"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick pickup hour pills */}
              <div className="flex items-center gap-1 pt-1 overflow-x-auto scrollbar-none">
                <span className="text-[10px] text-slate-400 shrink-0 font-medium">Giờ:</span>
                {['08:00', '09:00', '12:00', '14:00', '18:00'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setStartTimeStr(chip)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition shrink-0 ${
                      startTimeStr === chip
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Trả máy */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span>2. Thời gian TRẢ máy (Dự kiến)</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyPresetDuration(6)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                  >
                    +6h
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetDuration(24)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                  >
                    +1 ngày
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] font-bold text-slate-500">Chọn ngày trả:</label>
                    {endDateStr && (
                      <span className="text-[9.5px] font-black text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                        {formatDateVN(endDateStr)}. {endTimeStr}
                      </span>
                    )}
                  </div>
                  <DatePickerVN
                    value={endDateStr}
                    onChange={(val) => setEndDateStr(val)}
                    accentColor="amber"
                    placeholder="dd/mm/yyyy"
                  />
                  <span className="text-[9.5px] text-slate-500 block mt-0.5">
                    Định dạng: <strong className="text-amber-700">{endDateStr ? `${formatDateVN(endDateStr)}. ${endTimeStr}` : 'dd/mm/yyyy. hh:mm'}</strong>
                  </span>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Chọn giờ trả:</label>
                  <select
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-2 py-1.5 text-xs font-bold text-slate-900 focus:border-cyan-500 focus:bg-white focus:outline-none shadow-xs"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick return hour pills */}
              <div className="flex items-center gap-1 pt-1 overflow-x-auto scrollbar-none">
                <span className="text-[10px] text-slate-400 shrink-0 font-medium">Giờ:</span>
                {['18:00', '19:00', '20:00', '21:00', '22:00'].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setEndTimeStr(chip)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition shrink-0 ${
                      endTimeStr === chip
                        ? 'bg-amber-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-600 pt-1.5 border-t border-slate-200">
            <span className="flex items-center gap-1">
              <span>Định dạng lịch thuê:</span>
              <strong className="text-cyan-800 font-bold">
                {startDateStr ? `${formatDateVN(startDateStr)}. ${startTimeStr}` : '--'}
              </strong>
              <span>→</span>
              <strong className="text-amber-800 font-bold">
                {endDateStr ? `${formatDateVN(endDateStr)}. ${endTimeStr}` : '--'}
              </strong>
            </span>
            <span className="font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
              {rentalDuration.hours} giờ ({rentalDuration.days} ngày)
            </span>
          </div>
        </div>

        {/* 2. CHỌN THIẾT BỊ (TỰ ĐỘNG LỌC MÁY TRỐNG TRONG THỜI GIAN ĐÃ CHỌN) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>Chọn thiết bị thuê ({selectedEquipmentIds.length} máy đã chọn)</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEquipmentTab('available')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  equipmentTab === 'available'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Máy đang trống ({availableEquipList.length})
              </button>
              <button
                type="button"
                onClick={() => setEquipmentTab('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  equipmentTab === 'all'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả máy ({allEquipment.length})
              </button>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 divide-y divide-slate-100 shadow-xs">
            {(equipmentTab === 'available' ? availableEquipList : allEquipment).map((eq) => {
              const isSelected = selectedEquipmentIds.includes(eq.id!);
              const isConflicting = conflicts.some((c) => c.equipmentId === eq.id);

              return (
                <div
                  key={eq.id}
                  onClick={() => toggleEquipment(eq.id!)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                    isConflicting
                      ? 'bg-rose-50 border border-rose-200 text-rose-900'
                      : isSelected
                      ? 'bg-cyan-50/80 border border-cyan-300 text-cyan-950 font-semibold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded accent-cyan-600 w-4 h-4 cursor-pointer"
                    />
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {eq.asset_code}
                        </span>
                        <span className="font-bold text-xs">{eq.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {eq.accessories?.slice(0, 2).join(', ')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-emerald-700">
                      {formatVND(eq.daily_rate)}/ngày
                    </span>
                    {isConflicting && (
                      <span className="text-[10px] font-bold bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded">
                        Đang bận
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {equipmentTab === 'available' && availableEquipList.length === 0 && (
              <div className="py-6 text-center text-slate-400 text-xs">
                Không có thiết bị nào đang trống trong khung giờ này.
              </div>
            )}
          </div>
        </div>

        {/* 3. THÔNG TIN KHÁCH HÀNG (MẶC ĐỊNH AUTO THÊM KHÁCH MỚI) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <User className="w-4 h-4 text-cyan-600" />
                <span>Thông tin khách hàng</span>
              </label>
              {selectedCustomerId === 'new' || !selectedCustomerId ? (
                <span className="text-[10px] font-bold text-cyan-800 bg-cyan-100/70 px-2 py-0.5 rounded-md border border-cyan-200">
                  🆕 Thêm khách mới
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  Khách quen đã lưu
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {selectedCustomerId !== 'new' && selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId('new');
                    setCustomerName('');
                    setCustomerPhone('');
                    setCustomerCCCD('');
                  }}
                  className="text-[11px] font-bold text-cyan-700 bg-white border border-cyan-200 hover:bg-cyan-50 px-2 py-0.5 rounded-lg transition"
                >
                  + Đổi sang thêm khách mới
                </button>
              )}

              <select
                value={selectedCustomerId}
                onChange={handleCustomerSelect}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
              >
                <option value="new">+ Thêm khách mới</option>
                {customers.length > 0 && (
                  <optgroup label="Chọn từ khách quen đã có">
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                Tên khách hàng <span className="text-rose-500 font-bold">* (Bắt buộc)</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="VD: Nguyễn Văn Nam"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 font-semibold focus:border-cyan-500 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                Số điện thoại (Tùy chọn)
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="090..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                Số CCCD / CMND (Tùy chọn)
              </label>
              <input
                type="text"
                value={customerCCCD}
                onChange={(e) => setCustomerCCCD(e.target.value)}
                placeholder="001..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* 4. CÁC KHOẢN TIỀN: TIỀN THUÊ LINH ĐỘNG, CỌC GIỮ LỊCH, CỌC THẾ CHÂN */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Các khoản tiền khi cho thuê</span>
            </h4>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-cyan-700">
                <input
                  type="checkbox"
                  checked={isCustomRent}
                  onChange={(e) => setIsCustomRent(e.target.checked)}
                  className="rounded accent-cyan-600 w-3.5 h-3.5"
                />
                <span>Linh động nhập số tiền thuê tùy chỉnh</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Khoản 1: Tiền thuê */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 text-[11px]">1. Tiền thuê máy</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-medium">
                  Thu khi nhận máy
                </span>
              </div>
              <input
                type="number"
                min="0"
                step="10000"
                value={isCustomRent ? customRentAmount : autoCalculatedRent}
                onChange={(e) => {
                  setIsCustomRent(true);
                  setCustomRentAmount(Number(e.target.value));
                }}
                className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-sm font-bold text-emerald-700 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 block">
                {isCustomRent ? 'Đang nhập giá tùy chỉnh' : `Tự tính (${rentalDuration.days} ngày)`}
              </span>
            </div>

            {/* Khoản 2: Cọc giữ lịch (Mặc định 100k, tự động đồng bộ ô Đã nhận) */}
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-950 text-[11px]">2. Cọc giữ lịch</span>
                <span className="text-[10px] text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded font-medium">
                  Mặc định 100k
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Tiền cọc yêu cầu:</label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={depositHoldingRequired}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setDepositHoldingRequired(val);
                    setDepositHoldingReceived(val);
                  }}
                  className="w-full rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-sm font-bold text-sky-800 focus:outline-none"
                />
              </div>

              {/* Quick preset buttons */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                {[100000, 200000, 500000, 0].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setDepositHoldingRequired(chip);
                      setDepositHoldingReceived(chip);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition shrink-0 ${
                      depositHoldingRequired === chip
                        ? 'bg-sky-600 text-white'
                        : 'bg-white border border-sky-200 text-sky-800 hover:bg-sky-100'
                    }`}
                  >
                    {chip === 0 ? '0đ' : `${chip / 1000}k`}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-700 pt-1 border-t border-sky-200">
                <span className="font-medium">Đã nhận cọc:</span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={depositHoldingReceived}
                  onChange={(e) => setDepositHoldingReceived(Number(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-sky-300 bg-white px-2 py-1 text-right font-bold text-sky-900 focus:outline-none shadow-2xs"
                />
              </div>
            </div>

            {/* Khoản 3: Cọc thế chân */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-950 text-[11px]">3. Cọc thế chân</span>
                <span className="text-[10px] text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded font-medium">
                  Hoàn khi trả máy
                </span>
              </div>
              <input
                type="number"
                min="0"
                step="50000"
                value={depositSecurityRequired}
                onChange={(e) => setDepositSecurityRequired(Number(e.target.value))}
                className="w-full rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-sm font-bold text-indigo-800 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 block">
                Mặc định theo máy: {formatVND(autoSecurityDeposit)}
              </span>
            </div>
          </div>

          {/* Giảm giá & Phụ phí */}
          <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div>
              <span className="text-slate-600 block text-[11px] mb-0.5">Giảm giá / Chiết khấu (VND):</span>
              <input
                type="number"
                min="0"
                step="10000"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 focus:outline-none"
              />
            </div>
            <div>
              <span className="text-slate-600 block text-[11px] mb-0.5">Phụ phí giao tận nơi / Vệ sinh:</span>
              <input
                type="number"
                min="0"
                step="10000"
                value={extraFees}
                onChange={(e) => setExtraFees(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Final Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-slate-500 text-[11px] block">Tổng tiền thuê máy chốt:</span>
              <strong className="text-emerald-700 font-black text-lg">
                {formatVND(effectiveTotalRent)}
              </strong>
            </div>

            <div className="text-right text-[11px] space-y-0.5 text-slate-600">
              <div>Cọc giữ lịch: <strong>{formatVND(depositHoldingRequired)}</strong></div>
              <div>Cọc thế chân bảo lãnh: <strong>{formatVND(depositSecurityRequired)}</strong></div>
            </div>
          </div>
        </div>

        {/* 5. Trạng thái & Ghi chú */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Trạng thái đơn</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none shadow-xs"
            >
              <option value="confirmed">Đã chốt lịch (Confirmed)</option>
              <option value="active">Bàn giao & Đang thuê (Active)</option>
              <option value="draft">Bản nháp (Draft)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Ghi chú bàn giao</label>
            <input
              type="text"
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="VD: Khách giữ CCCD gốc..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none shadow-xs"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSubmitting || conflicts.length > 0}
            className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 font-bold text-white shadow-md hover:brightness-105 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : bookingToEdit ? 'Lưu thay đổi' : 'Xác nhận tạo đơn'}
          </button>
        </div>
      </form>
    </GlassModal>
  );
};
