import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  User,
  Phone,
  Calendar,
  CheckCircle2,
  Printer,
  ArrowRight,
  Package,
  Trash2,
  Copy,
  Check,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassModal } from '../common/GlassModal.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import {
  formatVND,
  formatDateTimeVN,
  BOOKING_STATUS_MAP,
  TRUST_LEVEL_MAP,
  STORE_OWNER,
} from '../../utils/formatters.ts';
import {
  buildRentalMessages,
  getRecommendedMessageType,
  copyTextWithToast,
  RENTAL_MESSAGE_TYPES,
  formatMoneyGAS,
  isHoldingDepositReceived,
  isSecurityDepositReceived,
  isKeepCCCD,
  type RentalMessageKey,
} from '../../utils/rentalMessages.ts';
import type { Booking, Equipment } from '../../types/index.ts';

interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number | null;
  onEdit: (booking: Booking) => void;
}

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  isOpen,
  onClose,
  bookingId,
  onEdit,
}) => {
  const booking = useLiveQuery(
    () => (bookingId ? db.bookings.get(bookingId) : undefined),
    [bookingId]
  );
  const bookingItems =
    useLiveQuery(
      () => (bookingId ? db.booking_items.where('booking_id').equals(bookingId).toArray() : []),
      [bookingId]
    ) || [];
  const customer = useLiveQuery(
    () => (booking?.customer_id ? db.customers.get(booking.customer_id) : undefined),
    [booking]
  );
  const allEquipment = useLiveQuery(() => db.equipment.toArray()) || [];

  const equipmentMap = React.useMemo(() => {
    return new Map(allEquipment.map((e) => [e.id, e]));
  }, [allEquipment]);

  const [showContractPreview, setShowContractPreview] = useState(false);
  const [returnNoteInput, setReturnNoteInput] = useState('');
  const [returnExtraFee, setReturnExtraFee] = useState<number>(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<RentalMessageKey | null>(null);
  const [editedMessages, setEditedMessages] = useState<Partial<Record<RentalMessageKey, string>>>({});
  const [isMessageSectionOpen, setIsMessageSectionOpen] = useState(false);
  const [openMessageKey, setOpenMessageKey] = useState<RentalMessageKey | null>(null);

  if (!booking) return null;

  const statusConfig = BOOKING_STATUS_MAP[booking.status] || BOOKING_STATUS_MAP.draft;

  const bookingEquipments = bookingItems
    .map((bi) => equipmentMap.get(bi.equipment_id))
    .filter(Boolean) as Equipment[];

  const messages = buildRentalMessages(booking, bookingEquipments, customer);
  const recommendedMsg = getRecommendedMessageType(booking);

  const daNhanCocGiuLich = isHoldingDepositReceived(booking);
  const daNhanCocTheChan = isSecurityDepositReceived(booking);
  const daNhanCCCD = Boolean(booking.has_received_cccd || booking.status === 'active');
  const daThanhToan = Boolean(booking.is_rent_paid || booking.status === 'active' || booking.status === 'returned');

  const handleCopyMessage = async (key: RentalMessageKey, overrideText?: string) => {
    const meta = RENTAL_MESSAGE_TYPES.find((m) => m.key === key);
    const text = overrideText ?? editedMessages[key] ?? messages[key];
    await copyTextWithToast(
      text,
      `Đã copy "${meta?.title || 'tin nhắn'}" của khách ${customer?.name || booking.booking_code}!`
    );
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  // Toggle accessory checklist state
  const handleToggleAccessory = async (
    itemId: number,
    accIndex: number,
    field: 'checked_out' | 'checked_in'
  ) => {
    const item = bookingItems.find((bi) => bi.id === itemId);
    if (!item) return;

    const updatedChecklist = [...item.accessories_checklist];
    updatedChecklist[accIndex] = {
      ...updatedChecklist[accIndex],
      [field]: !updatedChecklist[accIndex][field],
    };

    await db.booking_items.update(itemId, {
      accessories_checklist: updatedChecklist,
    });
  };

  // Quick status change to Confirmed (Giữ lịch)
  const handleSetHoldStatus = async () => {
    if (!booking.id) return;
    const patch: Partial<Booking> = {
      status: 'confirmed',
    };
    await db.bookings.update(booking.id, patch);
    for (const item of bookingItems) {
      await db.equipment.update(item.equipment_id, { status: 'available' });
    }
    const updatedBooking: Booking = { ...booking, ...patch };
    const nextMsgs = buildRentalMessages(updatedBooking, bookingEquipments, customer);
    await handleCopyMessage('depositReceived', nextMsgs.depositReceived);
  };

  // Action: Handover Equipment (Confirmed -> Active / DA_GIAO_MAY)
  // Khi giao máy cho khách sẽ nhận: tiền cọc thế chân + tiền thuê + cccd bản cứng và check vneid
  const handleHandoverToCustomer = async () => {
    if (!booking.id) return;
    const now = new Date().toISOString();

    const secRequired = booking.deposit_security_required || booking.deposit_required || 0;

    const patch: Partial<Booking> = {
      status: 'active',
      deposit_security_received: secRequired,
      deposit_received: secRequired,
      has_received_security_deposit: true,
      has_received_cccd: true,
      keep_cccd: true,
      is_rent_paid: true,
      deposit_holding_returned: booking.deposit_holding_received || 0,
    };

    await db.bookings.update(booking.id, patch);

    for (const item of bookingItems) {
      await db.equipment.update(item.equipment_id, { status: 'rented' });
    }

    // 1. Thu tiền thuê máy
    await db.transactions.add({
      booking_id: booking.id,
      type: 'income_rent',
      amount: booking.total_rent,
      payment_method: 'transfer',
      date: now,
      note: `Thu tiền thuê đơn ${booking.booking_code} (${customer?.name})`,
      is_deposit: false,
    });

    // 2. Thu cọc thế chân
    if (secRequired > 0) {
      await db.transactions.add({
        booking_id: booking.id,
        type: 'deposit_security_in',
        amount: secRequired,
        payment_method: 'transfer',
        date: now,
        note: `Thu cọc thế chân đơn ${booking.booking_code}`,
        is_deposit: true,
      });
    }

    // 3. Hoàn/Cấn trừ cọc giữ lịch nếu khách đã nộp trước
    if ((booking.deposit_holding_received || 0) > 0) {
      await db.transactions.add({
        booking_id: booking.id,
        type: 'deposit_holding_refund',
        amount: booking.deposit_holding_received,
        payment_method: 'transfer',
        date: now,
        note: `Cấn trừ / hoàn cọc giữ lịch khi giao máy đơn ${booking.booking_code}`,
        is_deposit: true,
      });
    }

    // Auto-copy handedOver message
    const updatedBooking: Booking = { ...booking, ...patch };
    const nextMsgs = buildRentalMessages(updatedBooking, bookingEquipments, customer);
    await handleCopyMessage('handedOver', nextMsgs.handedOver);
  };

  // Action: Complete & Return Equipment (Active -> Returned / DA_TRA)
  const handleCompleteReturn = async () => {
    if (!booking.id) return;
    const now = new Date().toISOString();

    const extra = Number(returnExtraFee) || 0;
    const secReceived = booking.deposit_security_received || booking.deposit_received || 0;
    const finalDepositRefund = Math.max(0, secReceived - extra);

    const patch: Partial<Booking> = {
      status: 'returned',
      actual_return_at: now,
      extra_fees: (booking.extra_fees || 0) + extra,
      deposit_security_returned: finalDepositRefund,
      deposit_returned: finalDepositRefund,
      return_notes: returnNoteInput.trim() || 'Máy hoàn hảo, đầy đủ phụ kiện',
    };

    await db.bookings.update(booking.id, patch);

    for (const item of bookingItems) {
      await db.equipment.update(item.equipment_id, { status: 'available' });
    }

    // Hoàn cọc thế chân
    if (finalDepositRefund > 0) {
      await db.transactions.add({
        booking_id: booking.id,
        type: 'deposit_security_refund',
        amount: finalDepositRefund,
        payment_method: 'transfer',
        date: now,
        note: `Hoàn cọc thế chân đơn ${booking.booking_code} (${customer?.name})`,
        is_deposit: true,
      });
    }

    // Phụ phí phát sinh
    if (extra > 0) {
      await db.transactions.add({
        booking_id: booking.id,
        type: 'other_income',
        amount: extra,
        payment_method: 'transfer',
        date: now,
        note: `Phụ phí trả máy trễ / vệ sinh đơn ${booking.booking_code}`,
        is_deposit: false,
      });
    }

    // Auto-copy completed message
    const updatedBooking: Booking = { ...booking, ...patch };
    const nextMsgs = buildRentalMessages(updatedBooking, bookingEquipments, customer);
    await handleCopyMessage('completed', nextMsgs.completed);
  };

  const handleConfirmCancel = async () => {
    if (!booking.id) return;
    await db.bookings.update(booking.id, { status: 'cancelled' });
    for (const item of bookingItems) {
      await db.equipment.update(item.equipment_id, { status: 'available' });
    }
    setShowCancelModal(false);
  };

  const handleConfirmDelete = async () => {
    if (!booking.id) return;
    await db.booking_items.where('booking_id').equals(booking.id).delete();
    await db.transactions.where('booking_id').equals(booking.id).delete();
    for (const item of bookingItems) {
      await db.equipment.update(item.equipment_id, { status: 'available' });
    }
    await db.bookings.delete(booking.id);
    setShowDeleteModal(false);
    onClose();
  };

  const machineNamesHeader =
    bookingEquipments.length > 0
      ? bookingEquipments.map((e) => e.name).join(' + ')
      : booking.booking_code;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${machineNamesHeader} • ${customer?.name || 'Khách'}`}
      subtitle={`Mã đơn: ${booking.booking_code} • ${customer?.phone || 'Chưa có SĐT'}`}
      maxWidth="2xl"
    >
      <div className="space-y-3.5 text-xs text-slate-800">
        {/* Top Status & Print Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${statusConfig.bg} ${statusConfig.border}`}
            >
              {statusConfig.label}
            </span>
            <span className="text-slate-600">
              Giá thuê:{' '}
              <strong className="text-emerald-700 font-bold text-sm">
                {formatVND(booking.total_rent)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContractPreview(!showContractPreview)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" />
              <span>{showContractPreview ? 'Chi tiết lịch' : 'In Biên bản'}</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onEdit(booking);
              }}
              className="rounded-xl bg-blue-600 text-white px-3.5 py-1.5 hover:bg-blue-700 font-bold transition"
            >
              Chỉnh sửa
            </button>
          </div>
        </div>

        {/* Printable Contract Preview */}
        {showContractPreview ? (
          <div className="rounded-2xl border border-slate-300 bg-white p-6 space-y-4 shadow-sm text-slate-900 font-sans">
            <div className="text-center border-b border-slate-200 pb-4">
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900">
                BIÊN BẢN BÀN GIAO & CHO THUÊ THIẾT BỊ QUAY CHỤP
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">Mã đơn: {booking.booking_code}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
                <strong className="block text-slate-900 font-bold border-b border-slate-200 pb-1">
                  BÊN CHO THUÊ (BÊN A)
                </strong>
                <p>
                  Chủ cơ sở: <strong>{STORE_OWNER.name}</strong>
                </p>
                <p>
                  Số điện thoại: <strong>{STORE_OWNER.phone}</strong>
                </p>
                <p>Địa chỉ: {STORE_OWNER.address}</p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
                <strong className="block text-slate-900 font-bold border-b border-slate-200 pb-1">
                  BÊN THUÊ (BÊN B)
                </strong>
                <p>
                  Họ tên: <strong>{customer?.name}</strong>
                </p>
                <p>Số điện thoại: {customer?.phone || 'Chưa cung cấp'}</p>
                <p>CCCD/CMND: {customer?.identity_card || 'Bản cứng + đối chiếu VNeID'}</p>
                <p>Địa chỉ: {customer?.address || 'Tại cơ sở'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <strong className="block text-slate-900 mb-1">THỜI GIAN THUÊ MÁY:</strong>
              <p>
                Nhận lúc: <strong>{formatDateTimeVN(booking.start_at)}</strong> — Trả lúc:{' '}
                <strong>{formatDateTimeVN(booking.end_at)}</strong>
              </p>
            </div>

            <div>
              <strong className="block text-slate-900 mb-1">DANH SÁCH THIẾT BỊ BÀN GIAO:</strong>
              <table className="w-full border-collapse border border-slate-200 text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-200 p-2">Mã máy</th>
                    <th className="border border-slate-200 p-2">Tên thiết bị</th>
                    <th className="border border-slate-200 p-2">Phụ kiện bàn giao</th>
                    <th className="border border-slate-200 p-2 text-right">Giá thuê</th>
                  </tr>
                </thead>
                <tbody>
                  {bookingItems.map((item) => {
                    const eq = equipmentMap.get(item.equipment_id);
                    return (
                      <tr key={item.id}>
                        <td className="border border-slate-200 p-2 font-mono font-bold text-slate-700">
                          {eq?.asset_code}
                        </td>
                        <td className="border border-slate-200 p-2 font-bold text-slate-900">
                          {eq?.name}
                        </td>
                        <td className="border border-slate-200 p-2 text-slate-600">
                          {(eq?.accessories || []).join(', ')}
                        </td>
                        <td className="border border-slate-200 p-2 text-right font-bold text-emerald-700">
                          {formatVND(item.rental_price)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-xs">
              <div>
                <span className="text-slate-500 block">1. Tiền thuê máy:</span>
                <strong className="text-emerald-700 font-bold text-sm">
                  {formatVND(booking.total_rent)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">2. Cọc giữ lịch:</span>
                <strong className="text-sky-700 font-bold">
                  {formatVND(booking.deposit_holding_required || 0)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">3. Cọc thế chân:</span>
                <strong className="text-indigo-700 font-bold">
                  {formatVND(
                    booking.deposit_security_required || booking.deposit_required || 0
                  )}
                </strong>
              </div>
            </div>

            <div className="pt-8 grid grid-cols-2 text-center text-slate-700">
              <div>
                <p className="font-bold">ĐẠI DIỆN BÊN CHO THUÊ</p>
                <p className="text-[10px] text-slate-400 mt-12">{STORE_OWNER.name}</p>
              </div>
              <div>
                <p className="font-bold">ĐẠI DIỆN BÊN THUÊ</p>
                <p className="text-[10px] text-slate-400 mt-12">{customer?.name}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 1. 6-BOX DETAIL GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <span className="block text-[10px] font-black uppercase text-slate-400">
                  Nhận máy
                </span>
                <strong className="block mt-0.5 text-xs font-black text-slate-900">
                  {formatDateTimeVN(booking.start_at)}
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <span className="block text-[10px] font-black uppercase text-slate-400">
                  Trả máy
                </span>
                <strong className="block mt-0.5 text-xs font-black text-amber-800">
                  {formatDateTimeVN(booking.end_at)}
                </strong>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5">
                <span className="block text-[10px] font-black uppercase text-emerald-700">
                  Giá thuê
                </span>
                <strong className="block mt-0.5 text-xs font-black text-emerald-800">
                  {formatMoneyGAS(booking.total_rent)} • {daThanhToan ? 'Đã thu' : 'Thu khi giao'}
                </strong>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-2.5">
                <span className="block text-[10px] font-black uppercase text-sky-700">
                  Cọc giữ lịch
                </span>
                <strong className="block mt-0.5 text-xs font-black text-sky-900">
                  {formatMoneyGAS(booking.deposit_holding_required || 0)} •{' '}
                  {daNhanCocGiuLich ? 'Đã nhận' : 'Chưa nhận'}
                </strong>
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5">
                <span className="block text-[10px] font-black uppercase text-indigo-700">
                  Cọc thế chân
                </span>
                <strong className="block mt-0.5 text-xs font-black text-indigo-900">
                  {formatMoneyGAS(
                    booking.deposit_security_required || booking.deposit_required || 0
                  )}{' '}
                  • {daNhanCocTheChan ? 'Đã nhận' : 'Khi giao máy'}
                </strong>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <span className="block text-[10px] font-black uppercase text-slate-400">
                  CCCD & VNeID
                </span>
                <strong className="block mt-0.5 text-xs font-black text-slate-900 truncate">
                  {daNhanCCCD ? '✓ Đã nhận CCCD' : 'Giữ CCCD + VNeID'}
                </strong>
                {customer?.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{customer.phone}</span>
                  </a>
                )}
              </div>
            </div>

            {/* 2. THAO TÁC CẬP NHẬT TRẠNG THÁI NHANH (Chỉ giữ lại các nút chuyển trạng thái gọn gàng) */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-black text-blue-950">
                  Cập nhật trạng thái nhanh
                </span>
                <span className="text-[10.5px] font-semibold text-blue-800">
                  Khi giao máy nhận: Cọc thế chân + Tiền thuê + CCCD bản cứng & check VNeID
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {booking.status !== 'confirmed' && (
                  <button
                    type="button"
                    onClick={handleSetHoldStatus}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white shadow-2xs transition active:scale-95"
                  >
                    Giữ lịch
                  </button>
                )}

                {booking.status !== 'active' && booking.status !== 'returned' && (
                  <button
                    type="button"
                    onClick={handleHandoverToCustomer}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition active:scale-95"
                  >
                    Đã giao máy
                  </button>
                )}

                {booking.status !== 'returned' && (
                  <button
                    type="button"
                    onClick={handleCompleteReturn}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs transition active:scale-95"
                  >
                    Đã trả máy
                  </button>
                )}

                {booking.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white shadow-2xs transition active:scale-95"
                  >
                    Hủy lịch
                  </button>
                )}
              </div>
            </div>

            {/* 3. MẪU TIN NHẮN TỰ ĐỘNG DẠNG DROPDOWN XỔ XUỐNG GỌN GÀNG */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div
                onClick={() => setIsMessageSectionOpen(!isMessageSectionOpen)}
                className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer select-none transition"
              >
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-blue-600" />
                  <span className="font-black text-slate-900 text-xs">
                    Mẫu tin nhắn tự động (Bấm để {isMessageSectionOpen ? 'thu gọn' : 'xổ xuống'})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyMessage(recommendedMsg.key);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 text-[11px] font-bold transition shadow-2xs"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy nhanh: {recommendedMsg.reason}</span>
                  </button>
                  <span className="text-xs font-bold text-slate-500 px-1">
                    {isMessageSectionOpen ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {isMessageSectionOpen && (
                <div className="p-3 border-t border-slate-200 space-y-2 bg-white">
                  {RENTAL_MESSAGE_TYPES.map((mType) => {
                    const isRecommended = recommendedMsg.key === mType.key;
                    const isCopied = copiedKey === mType.key;
                    const isItemOpen =
                      openMessageKey === mType.key ||
                      (openMessageKey === null && isRecommended);
                    const currentText = editedMessages[mType.key] ?? messages[mType.key];

                    return (
                      <div
                        key={mType.key}
                        className={`rounded-xl border transition overflow-hidden ${
                          isRecommended
                            ? 'border-blue-300 bg-blue-50/20'
                            : 'border-slate-200 bg-slate-50/40'
                        }`}
                      >
                        <div
                          onClick={() =>
                            setOpenMessageKey(isItemOpen ? ('none' as any) : mType.key)
                          }
                          className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-slate-100/70 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] text-slate-400 font-bold">
                              {isItemOpen ? '▾' : '▸'}
                            </span>
                            <h4 className="font-bold text-slate-900 text-xs truncate">
                              {mType.title}
                            </h4>
                            {isRecommended && (
                              <span className="text-[9.5px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                                Gợi ý
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMessage(mType.key);
                            }}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition shrink-0 ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Đã copy</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>

                        {isItemOpen && (
                          <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/70 bg-white">
                            <textarea
                              rows={3}
                              value={currentText}
                              onChange={(e) =>
                                setEditedMessages((prev) => ({
                                  ...prev,
                                  [mType.key]: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs text-slate-800 leading-relaxed focus:border-blue-500 focus:bg-white focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Checklist Thiết bị & Phụ kiện */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-600" />
                <span>Checklist Thiết bị & Phụ kiện đi kèm</span>
              </h3>

              <div className="space-y-2">
                {bookingItems.map((item) => {
                  const eq = equipmentMap.get(item.equipment_id);
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-700 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                            {eq?.asset_code}
                          </span>
                          <span className="font-bold text-slate-900">{eq?.name}</span>
                        </div>
                        <span className="text-emerald-700 font-bold">
                          {formatVND(item.rental_price)}
                        </span>
                      </div>

                      {/* Checklist Phụ kiện */}
                      {item.accessories_checklist && item.accessories_checklist.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-slate-500">
                            Phụ kiện (Tick xác nhận giao & nhận):
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {item.accessories_checklist.map((acc, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[11px]"
                              >
                                <span className="text-slate-800 font-medium">{acc.name}</span>
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={acc.checked_out}
                                      onChange={() =>
                                        item.id &&
                                        handleToggleAccessory(item.id, idx, 'checked_out')
                                      }
                                      className="rounded accent-cyan-600 w-3.5 h-3.5"
                                    />
                                    <span className="text-[10px] text-slate-500">Đã giao</span>
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={acc.checked_in}
                                      onChange={() =>
                                        item.id && handleToggleAccessory(item.id, idx, 'checked_in')
                                      }
                                      className="rounded accent-emerald-600 w-3.5 h-3.5"
                                    />
                                    <span className="text-[10px] text-slate-500">Đã thu</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Quy trình trả máy có phụ phí */}
            {booking.status === 'active' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div>
                  <h4 className="font-bold text-amber-950 text-xs">
                    Nhận lại máy & Tính phụ phí (nếu có)
                  </h4>
                  <p className="text-[11px] text-amber-800">
                    Nếu có phát sinh trễ giờ/hư hỏng, nhập phụ phí bên dưới trước khi bấm Nhận máy & Hoàn cọc.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                      Phụ phí phát sinh (trễ giờ / vệ sinh):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50000"
                      value={returnExtraFee}
                      onChange={(e) => setReturnExtraFee(Number(e.target.value))}
                      placeholder="0 VND"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-amber-800 font-bold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-700 font-semibold block mb-1">
                      Ghi chú kiểm tra máy khi nhận:
                    </label>
                    <input
                      type="text"
                      value={returnNoteInput}
                      onChange={(e) => setReturnNoteInput(e.target.value)}
                      placeholder="Máy hoàn hảo, đầy đủ..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-amber-200">
                  <span className="text-xs text-indigo-900 font-medium">
                    Cọc thế chân hoàn lại khách:{' '}
                    <strong className="text-sm">
                      {formatVND(
                        Math.max(
                          0,
                          (booking.deposit_security_received || booking.deposit_received || 0) -
                            Number(returnExtraFee)
                        )
                      )}
                    </strong>
                  </span>

                  <button
                    onClick={handleCompleteReturn}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 font-bold text-white shadow-xs active:scale-95 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Nhận máy & Copy tin hoàn tất</span>
                  </button>
                </div>
              </div>
            )}

            {/* Actions: Cancel & Permanent Delete */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50/60 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:text-rose-900 transition active:scale-95"
                title="Xóa vĩnh viễn đơn thuê này"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa vĩnh viễn lịch thuê</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
          </>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
        title="Xác nhận hủy lịch thuê"
        itemName={booking ? `${booking.booking_code} - ${customer?.name || 'Khách'}` : ''}
        itemType="lịch thuê"
        description="Bạn có chắc chắn muốn chuyển lịch thuê này sang trạng thái HỦY? Thiết bị trong đơn sẽ được trả lại trạng thái sẵn sàng."
        confirmButtonText="Xác nhận hủy lịch"
      />

      {/* Permanent Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Xóa vĩnh viễn lịch thuê"
        itemName={booking ? `${booking.booking_code} (${customer?.name || 'Khách'})` : ''}
        itemType="lịch thuê"
        description="Lịch thuê này và tất cả các mục thiết bị, bút toán giao dịch liên quan sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu."
        confirmButtonText="Xác nhận xóa vĩnh viễn"
      />
    </GlassModal>
  );
};
