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
import { PopupSelect } from '../common/PopupSelect.tsx';
import { TimePickerPopup } from '../common/TimePickerPopup.tsx';
import { findConflictingEquipment, BookingWithEquipments } from '../../utils/overlap.ts';
import {
  toDateInputValue,
  combineDateAndTime,
  calculatePresetEnd,
  generateShortBookingCode,
} from '../../utils/bookingHelpers.ts';
import { formatVND, formatDateTimeVN, formatDateVN, parseVNDateTime } from '../../utils/formatters.ts';
import {
  buildRentalMessages,
  copyTextWithToast,
  isHoldingDepositReceived,
  isSecurityDepositReceived,
} from '../../utils/rentalMessages.ts';
import type { Booking, BookingItem, Customer, Equipment, BookingStatus } from '../../types/index.ts';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedEquipmentId?: number;
  initialDate?: Date;
  initialEndDate?: Date;
  bookingToEdit?: Booking | null;
  onSaved: () => void;
}

const EMPTY_CUSTOMERS: Customer[] = [];
const EMPTY_EQUIPMENT: Equipment[] = [];
const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_BOOKING_ITEMS: BookingItem[] = [];

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  preselectedEquipmentId,
  initialDate,
  initialEndDate,
  bookingToEdit,
  onSaved,
}) => {
  const customers = useLiveQuery(() => db.customers.toArray(), [], EMPTY_CUSTOMERS);
  const allEquipment = useLiveQuery(() => db.equipment.toArray(), [], EMPTY_EQUIPMENT);
  const allBookings = useLiveQuery(() => db.bookings.toArray(), [], EMPTY_BOOKINGS);
  const allBookingItems = useLiveQuery(() => db.booking_items.toArray(), [], EMPTY_BOOKING_ITEMS);

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
  const [hasReceivedHoldingDeposit, setHasReceivedHoldingDeposit] = useState<boolean>(true);

  // 2. Cọc thế chân (Cọc bảo lãnh tài sản - hoàn lại khi trả máy nguyên vẹn)
  const [depositSecurityRequired, setDepositSecurityRequired] = useState<number>(500000);
  const [depositSecurityReceived, setDepositSecurityReceived] = useState<number>(0);
  const [hasReceivedSecurityDeposit, setHasReceivedSecurityDeposit] = useState<boolean>(false);

  // 3. Checkboxes quen thuộc từ Google Apps Script (Giữ CCCD, Đã nhận CCCD, Đã thanh toán thuê)
  const [keepCCCD, setKeepCCCD] = useState<boolean>(true);
  const [hasReceivedCCCD, setHasReceivedCCCD] = useState<boolean>(false);
  const [isRentPaid, setIsRentPaid] = useState<boolean>(false);
  const [autoCopyOnSave, setAutoCopyOnSave] = useState<boolean>(true);

  const [status, setStatus] = useState<BookingStatus>('confirmed');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper date conversions
  const pad = (n: number) => String(n).padStart(2, '0');

  const initialDateTs = initialDate ? initialDate.getTime() : undefined;
  const initialEndDateTs = initialEndDate ? initialEndDate.getTime() : undefined;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    if (bookingToEdit) {
      setSelectedCustomerId(bookingToEdit.customer_id);
      const cust = customers.find((c) => c.id === bookingToEdit.customer_id);
      if (cust) {
        setCustomerName(cust.name);
        setCustomerPhone(cust.phone || '');
        setCustomerCCCD(cust.identity_card || '');
      } else if (bookingToEdit.customer_id) {
        db.customers.get(bookingToEdit.customer_id).then((fetched) => {
          if (!cancelled && fetched) {
            setCustomerName(fetched.name);
            setCustomerPhone(fetched.phone || '');
            setCustomerCCCD(fetched.identity_card || '');
          }
        });
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
      setHasReceivedHoldingDeposit(isHoldingDepositReceived(bookingToEdit));

      setDepositSecurityRequired(bookingToEdit.deposit_security_required || bookingToEdit.deposit_required || 0);
      setDepositSecurityReceived(bookingToEdit.deposit_security_received || bookingToEdit.deposit_received || 0);
      setHasReceivedSecurityDeposit(isSecurityDepositReceived(bookingToEdit));

      setKeepCCCD(bookingToEdit.keep_cccd !== undefined ? bookingToEdit.keep_cccd : true);
      setHasReceivedCCCD(Boolean(bookingToEdit.has_received_cccd));
      setIsRentPaid(Boolean(bookingToEdit.is_rent_paid));

      setStatus(bookingToEdit.status);
      setHandoverNotes(bookingToEdit.handover_notes || '');

      if (bookingToEdit.id) {
        db.booking_items
          .where('booking_id')
          .equals(bookingToEdit.id)
          .toArray()
          .then((items) => {
            if (!cancelled) {
              setSelectedEquipmentIds(items.map((bi) => bi.equipment_id));
            }
          });
      }
    } else {
      const now = new Date();
      const baseDate = initialDateTs !== undefined ? new Date(initialDateTs) : now;
      const hasCustomStartHour =
        initialDateTs !== undefined &&
        (baseDate.getHours() !== 0 || baseDate.getMinutes() !== 0);
      const returnDate =
        initialEndDateTs !== undefined
          ? new Date(initialEndDateTs)
          : new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);
      const hasCustomEndHour =
        initialEndDateTs !== undefined &&
        (returnDate.getHours() !== 0 || returnDate.getMinutes() !== 0);

      setStartDateStr(toDateInputValue(baseDate));
      setStartTimeStr(
        hasCustomStartHour ? `${pad(baseDate.getHours())}:${pad(baseDate.getMinutes())}` : '08:00'
      );
      setEndDateStr(toDateInputValue(returnDate));
      setEndTimeStr(
        hasCustomEndHour ? `${pad(returnDate.getHours())}:${pad(returnDate.getMinutes())}` : '18:00'
      );

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
      setHasReceivedHoldingDeposit(true);
      setHasReceivedSecurityDeposit(false);
      setKeepCCCD(true);
      setHasReceivedCCCD(false);
      setIsRentPaid(false);
      setStatus('confirmed');
      setHandoverNotes('');
    }
    setErrorMsg('');

    return () => {
      cancelled = true;
    };
  }, [isOpen, bookingToEdit?.id, preselectedEquipmentId, initialDateTs, initialEndDateTs]);

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

  const handleCustomerSelectValue = (val: string) => {
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

      const effectiveHoldingReceived = hasReceivedHoldingDeposit
        ? Number(depositHoldingReceived || depositHoldingRequired) || 0
        : 0;
      const effectiveSecurityReceived = hasReceivedSecurityDeposit
        ? Number(depositSecurityReceived || depositSecurityRequired) || 0
        : 0;

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
        deposit_holding_received: effectiveHoldingReceived,
        deposit_holding_returned: bookingToEdit?.deposit_holding_returned || 0,

        deposit_security_required: Number(depositSecurityRequired) || 0,
        deposit_security_received: effectiveSecurityReceived,
        deposit_security_returned: bookingToEdit?.deposit_security_returned || 0,

        deposit_required: Number(depositSecurityRequired) || 0,
        deposit_received: effectiveSecurityReceived,
        deposit_returned: bookingToEdit?.deposit_returned || 0,

        has_received_holding_deposit: hasReceivedHoldingDeposit,
        has_received_security_deposit: hasReceivedSecurityDeposit,
        keep_cccd: keepCCCD,
        has_received_cccd: hasReceivedCCCD,
        is_rent_paid: isRentPaid,

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
      if (!bookingToEdit && effectiveHoldingReceived > 0) {
        await db.transactions.add({
          booking_id: bookingId,
          type: 'deposit_holding_in',
          amount: effectiveHoldingReceived,
          payment_method: 'transfer',
          date: now.toISOString(),
          note: `Thu cọc giữ lịch đơn ${bookingCode} (${customerName})`,
          is_deposit: true,
        });
      }

      // Auto-copy confirmation message if enabled
      if (autoCopyOnSave) {
        const selectedEquipList = selectedEquipmentIds
          .map((id) => equipmentMap.get(id))
          .filter((e): e is Equipment => Boolean(e));
        const messages = buildRentalMessages(
          { ...bookingData, id: bookingId },
          selectedEquipList,
          {
            id: finalCustomerId,
            name: customerName.trim(),
            phone: customerPhone.trim() || undefined,
            identity_card: customerCCCD.trim() || undefined,
            trust_level: 'normal',
            created_at: now.toISOString(),
          }
        );
        const msgToCopy =
          status === 'active'
            ? messages.handedOver
            : status === 'returned'
            ? messages.completed
            : messages.depositReceived;
        await copyTextWithToast(
          msgToCopy,
          status === 'active'
            ? 'Đã lưu lịch thuê & tự động copy tin nhắn đã giao máy!'
            : 'Đã lưu lịch thuê & tự động copy tin nhắn xác nhận lịch!'
        );
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
      title={bookingToEdit ? `Sửa lịch thuê: ${bookingToEdit.booking_code}` : 'Thêm Lịch Thuê Máy'}
      subtitle="Giao diện gọn gàng • Tự động lọc máy trống & tạo tin nhắn"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs text-slate-800">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Overlap Conflict Banner */}
        {conflicts.length > 0 && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-rose-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Trùng lịch thiết bị!</span>
            </div>
            <ul className="list-disc list-inside text-[11px] font-semibold text-rose-700">
              {conflicts.map((c, i) => {
                const eq = equipmentMap.get(c.equipmentId);
                return (
                  <li key={i}>
                    {eq?.name} ({eq?.asset_code}) — Trùng đơn #{c.conflictingBookingId}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 1. THỜI GIAN NHẬN & TRẢ MÁY (GỌN GÀNG, RÕ RÀNG) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Thời gian thuê ({rentalDuration.hours}h • {rentalDuration.days} ngày)</span>
            </span>
            <div className="flex items-center gap-1">
              {[
                { label: '+6h', hours: 6 },
                { label: '+1 ngày', hours: 24 },
                { label: '+2 ngày', hours: 48 },
                { label: '+3 ngày', hours: 72 },
              ].map((p) => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => applyPresetDuration(p.hours)}
                  className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Nhận máy */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>Nhận máy *</span>
                <span className="text-[10px] font-semibold text-blue-600">dd/mm/yyyy</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                <div className="col-span-3">
                  <DatePickerVN
                    value={startDateStr}
                    onChange={(val) => setStartDateStr(val)}
                    accentColor="cyan"
                    placeholder="dd/mm/yyyy"
                  />
                </div>
                <div className="col-span-2">
                  <TimePickerPopup
                    value={startTimeStr}
                    onChange={(val) => setStartTimeStr(val)}
                    accentColor="cyan"
                  />
                </div>
              </div>
            </div>

            {/* Trả máy */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>Trả máy *</span>
                <span className="text-[10px] font-semibold text-amber-600">dd/mm/yyyy</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                <div className="col-span-3">
                  <DatePickerVN
                    value={endDateStr}
                    onChange={(val) => setEndDateStr(val)}
                    accentColor="amber"
                    placeholder="dd/mm/yyyy"
                  />
                </div>
                <div className="col-span-2">
                  <TimePickerPopup
                    value={endTimeStr}
                    onChange={(val) => setEndTimeStr(val)}
                    accentColor="amber"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. MÁY ẢNH / THIẾT BỊ THUÊ */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-900">
              Máy ảnh / Thiết bị * ({selectedEquipmentIds.length} đã chọn)
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEquipmentTab('available')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition ${
                  equipmentTab === 'available'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Máy trống ({availableEquipList.length})
              </button>
              <button
                type="button"
                onClick={() => setEquipmentTab('all')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition ${
                  equipmentTab === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({allEquipment.length})
              </button>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 divide-y divide-slate-100">
            {(equipmentTab === 'available' ? availableEquipList : allEquipment).map((eq) => {
              const isSelected = selectedEquipmentIds.includes(eq.id!);
              const isConflicting = conflicts.some((c) => c.equipmentId === eq.id);

              return (
                <div
                  key={eq.id}
                  onClick={() => toggleEquipment(eq.id!)}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                    isConflicting
                      ? 'bg-rose-50 text-rose-900'
                      : isSelected
                      ? 'bg-blue-50/90 text-blue-950 font-semibold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded accent-blue-600 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="font-bold text-xs truncate">{eq.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">({eq.asset_code})</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-emerald-700 text-[11px]">
                      {formatVND(eq.daily_rate)}/ngày
                    </span>
                    {isConflicting && (
                      <span className="text-[10px] font-bold bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded">
                        Trùng lịch
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {equipmentTab === 'available' && availableEquipList.length === 0 && (
              <div className="py-4 text-center text-slate-400 text-xs">
                Không có máy nào trống trong khung giờ này.
              </div>
            )}
          </div>
        </div>

        {/* 3. KHÁCH HÀNG (MẶC ĐỊNH THÊM KHÁCH MỚI) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="font-bold text-slate-900 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Khách hàng</span>
            </label>
            <PopupSelect
              value={selectedCustomerId || 'new'}
              onChange={handleCustomerSelectValue}
              searchable={customers.length > 0}
              searchPlaceholder="Tìm tên hoặc SĐT khách cũ..."
              dropdownAlign="right"
              dropdownWidthClass="w-64"
              className="w-48 sm:w-56"
              options={[
                {
                  value: 'new',
                  label: '+ Thêm khách mới',
                  sublabel: 'Nhập tên và số điện thoại bên dưới',
                },
                ...customers.map((c) => ({
                  value: c.id!,
                  label: c.name,
                  sublabel: c.phone ? `SĐT: ${c.phone}` : 'Khách cũ trong hệ thống',
                  group: 'Chọn khách cũ',
                })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                Tên khách *
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nhập tên khách hàng"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 font-semibold focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                Số điện thoại
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="090..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 4. GIÁ THUÊ, CỌC GIỮ LỊCH & KHI GIAO MÁY (CỌC THẾ CHÂN + TIỀN THUÊ + CCCD BẢN CỨNG & CHECK VNEID) */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Giá thuê */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Giá thuê (VND)</label>
              <input
                type="number"
                min="0"
                step="10000"
                value={isCustomRent ? customRentAmount : autoCalculatedRent}
                onChange={(e) => {
                  setIsCustomRent(true);
                  setCustomRentAmount(Number(e.target.value));
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700 focus:border-blue-500 focus:outline-none"
              />
              {selectedEquipmentIds.length === 1 && (() => {
                const eq = equipmentMap.get(selectedEquipmentIds[0]);
                if (!eq) return null;
                return (
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {eq.rate_6h ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomRent(true);
                          setCustomRentAmount(eq.rate_6h || 0);
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 hover:bg-emerald-50 text-slate-700"
                      >
                        6h: {formatVND(eq.rate_6h)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomRent(true);
                        setCustomRentAmount(eq.daily_rate || 0);
                      }}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 hover:bg-emerald-50 text-slate-700"
                    >
                      1d: {formatVND(eq.daily_rate)}
                    </button>
                    {eq.rate_2days ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomRent(true);
                          setCustomRentAmount(eq.rate_2days || 0);
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 hover:bg-emerald-50 text-slate-700"
                      >
                        2d: {formatVND(eq.rate_2days)}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            {/* Cọc giữ lịch */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Cọc giữ lịch</label>
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
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-800 focus:border-blue-500 focus:outline-none"
              />
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 mt-1.5">
                <input
                  type="checkbox"
                  checked={hasReceivedHoldingDeposit}
                  onChange={(e) => {
                    setHasReceivedHoldingDeposit(e.target.checked);
                    if (e.target.checked && depositHoldingReceived === 0) {
                      setDepositHoldingReceived(depositHoldingRequired || 100000);
                    }
                  }}
                  className="rounded accent-blue-600 w-3.5 h-3.5"
                />
                <span>Đã nhận cọc giữ lịch</span>
              </label>
            </div>

            {/* Cọc thế chân */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Cọc thế chân</label>
              <input
                type="number"
                min="0"
                step="50000"
                value={depositSecurityRequired}
                onChange={(e) => setDepositSecurityRequired(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Mặc định máy: {formatVND(autoSecurityDeposit)}
              </span>
            </div>
          </div>

          {/* KHI GIAO MÁY CHO KHÁCH: Chỉ 2 ô tích gọn gàng theo đúng yêu cầu */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-[11px] font-bold text-blue-950">
                Khi giao máy cho khách sẽ nhận: Tiền cọc thế chân + Tiền thuê + CCCD bản cứng & Check VNeID
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={hasReceivedSecurityDeposit}
                  onChange={(e) => {
                    setHasReceivedSecurityDeposit(e.target.checked);
                    if (e.target.checked && depositSecurityReceived === 0) {
                      setDepositSecurityReceived(depositSecurityRequired);
                    }
                  }}
                  className="rounded accent-blue-600 w-4 h-4"
                />
                <span>Đã nhận cọc thế chân</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={hasReceivedCCCD}
                  onChange={(e) => setHasReceivedCCCD(e.target.checked)}
                  className="rounded accent-blue-600 w-4 h-4"
                />
                <span>Đã nhận CCCD (bản cứng & check VNeID)</span>
              </label>
            </div>
          </div>
        </div>

        {/* 5. Trạng thái & Ghi chú */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Trạng thái</label>
            <PopupSelect
              value={status}
              onChange={(val) => {
                const nextStatus = val as BookingStatus;
                setStatus(nextStatus);
                if (nextStatus === 'active') {
                  setHasReceivedSecurityDeposit(true);
                  setHasReceivedCCCD(true);
                  setIsRentPaid(true);
                }
              }}
              options={[
                { value: 'confirmed', label: 'Giữ lịch' },
                { value: 'active', label: 'Đã giao máy' },
                { value: 'returned', label: 'Đã trả' },
                { value: 'cancelled', label: 'Hủy' },
              ]}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Ghi chú</label>
            <input
              type="text"
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="Ghi chú thêm nếu cần..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
            />
          </div>
        </div>

        {/* Auto-copy message checkbox + Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-200">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-blue-800">
            <input
              type="checkbox"
              checked={autoCopyOnSave}
              onChange={(e) => setAutoCopyOnSave(e.target.checked)}
              className="rounded accent-blue-600 w-3.5 h-3.5 cursor-pointer"
            />
            <span>Tự động copy tin nhắn sau khi lưu</span>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-1.5 font-semibold text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || conflicts.length > 0}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-1.5 font-bold text-white shadow-sm hover:brightness-105 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu lịch thuê'}
            </button>
          </div>
        </div>
      </form>
    </GlassModal>
  );
};
