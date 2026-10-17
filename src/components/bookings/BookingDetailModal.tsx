import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FileText,
  User,
  Phone,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Shield,
  ArrowRight,
  Package,
  Clock,
  MapPin,
  Trash2,
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
import type { Booking, BookingItem, Equipment, Customer } from '../../types/index.ts';

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
  const booking = useLiveQuery(() => (bookingId ? db.bookings.get(bookingId) : undefined), [bookingId]);
  const bookingItems = useLiveQuery(
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

  if (!booking) return null;

  const statusConfig = BOOKING_STATUS_MAP[booking.status] || BOOKING_STATUS_MAP.draft;
  const trustConfig = customer ? TRUST_LEVEL_MAP[customer.trust_level] || TRUST_LEVEL_MAP.normal : null;

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

  // Action: Handover Equipment (Confirmed -> Active)
  // Khi giao máy: Thu tiền thuê + Thu cọc thế chân (nếu có cọc giữ lịch thì cấn trừ hoặc hoàn trả)
  const handleHandoverToCustomer = async () => {
    if (!booking.id) return;
    const now = new Date().toISOString();

    const secRequired = booking.deposit_security_required || booking.deposit_required || 0;

    await db.bookings.update(booking.id, {
      status: 'active',
      deposit_security_received: secRequired,
      deposit_received: secRequired,
      // Đánh dấu cọc giữ lịch đã hoàn/cấn trừ
      deposit_holding_returned: booking.deposit_holding_received || 0,
    });

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
  };

  // Action: Complete & Return Equipment (Active -> Returned)
  // Khi trả máy: Kiểm tra máy, trừ phụ phí (nếu có) và Hoàn cọc thế chân cho khách
  const handleCompleteReturn = async () => {
    if (!booking.id) return;
    const now = new Date().toISOString();

    const extra = Number(returnExtraFee) || 0;
    const secReceived = booking.deposit_security_received || booking.deposit_received || 0;
    const finalDepositRefund = Math.max(0, secReceived - extra);

    await db.bookings.update(booking.id, {
      status: 'returned',
      actual_return_at: now,
      extra_fees: (booking.extra_fees || 0) + extra,
      deposit_security_returned: finalDepositRefund,
      deposit_returned: finalDepositRefund,
      return_notes: returnNoteInput.trim() || 'Máy hoàn hảo, đầy đủ phụ kiện',
    });

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

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chi tiết đơn: ${booking.booking_code}`}
      subtitle={`Tạo lúc: ${formatDateTimeVN(booking.created_at)}`}
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs text-slate-800">
        {/* Top Status & Print Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${statusConfig.bg} ${statusConfig.border}`}
            >
              {statusConfig.label}
            </span>
            <span className="text-slate-500">
              Tổng tiền thuê: <strong className="text-emerald-700 font-bold text-sm">{formatVND(booking.total_rent)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContractPreview(!showContractPreview)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-600" />
              <span>{showContractPreview ? 'Xem giao diện đơn' : 'In Hợp đồng / Biên bản'}</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onEdit(booking);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-100 shadow-xs font-semibold"
            >
              Sửa đơn
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
                <p>Chủ cơ sở: <strong>{STORE_OWNER.name}</strong></p>
                <p>Số điện thoại: <strong>{STORE_OWNER.phone}</strong></p>
                <p>Địa chỉ: {STORE_OWNER.address}</p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
                <strong className="block text-slate-900 font-bold border-b border-slate-200 pb-1">
                  BÊN THUÊ (BÊN B)
                </strong>
                <p>Họ tên: <strong>{customer?.name}</strong></p>
                <p>Số điện thoại: {customer?.phone || 'Chưa cung cấp'}</p>
                <p>CCCD/CMND: {customer?.identity_card || 'Chưa cung cấp'}</p>
                <p>Địa chỉ: {customer?.address || 'Tại cơ sở'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <strong className="block text-slate-900 mb-1">THỜI GIAN THUÊ MÁY:</strong>
              <p>
                Nhận lúc: <strong>{formatDateTimeVN(booking.start_at)}</strong> — Trả lúc: <strong>{formatDateTimeVN(booking.end_at)}</strong>
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
                <strong className="text-emerald-700 font-bold text-sm">{formatVND(booking.total_rent)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">2. Cọc giữ lịch:</span>
                <strong className="text-sky-700 font-bold">{formatVND(booking.deposit_holding_required || 0)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">3. Cọc thế chân:</span>
                <strong className="text-indigo-700 font-bold">{formatVND(booking.deposit_security_required || booking.deposit_required || 0)}</strong>
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
            {/* Customer & Time Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Khách hàng</span>
                  </span>
                  {trustConfig && (
                    <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${trustConfig.bg}`}>
                      {trustConfig.label}
                    </span>
                  )}
                </div>
                <div className="text-slate-900 font-bold text-sm">{customer?.name}</div>
                <div className="text-slate-600 flex items-center gap-2">
                  <Phone className="w-3 h-3 text-emerald-600" />
                  <span>{customer?.phone || 'Chưa cung cấp SĐT'}</span>
                  {customer?.identity_card && <span>• CCCD: {customer.identity_card}</span>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Lịch trình thuê (dd/mm/yyyy - 24h)</span>
                </span>
                <div className="text-slate-700">
                  Bắt đầu: <strong className="text-slate-900">{formatDateTimeVN(booking.start_at)}</strong>
                </div>
                <div className="text-slate-700">
                  Dự kiến trả: <strong className="text-amber-700">{formatDateTimeVN(booking.end_at)}</strong>
                </div>
              </div>
            </div>

            {/* Checklist Thiết bị & Phụ kiện */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-xs">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-600" />
                <span>Checklist Bàn giao & Thu hồi máy</span>
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
                        <span className="text-emerald-700 font-bold">{formatVND(item.rental_price)}</span>
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
                                      onChange={() => item.id && handleToggleAccessory(item.id, idx, 'checked_out')}
                                      className="rounded accent-cyan-600 w-3.5 h-3.5"
                                    />
                                    <span className="text-[10px] text-slate-500">Đã giao</span>
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={acc.checked_in}
                                      onChange={() => item.id && handleToggleAccessory(item.id, idx, 'checked_in')}
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

            {/* Chi tiết 3 khoản tiền */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 grid grid-cols-3 gap-2 shadow-xs">
              <div className="rounded-xl bg-emerald-50/50 p-2 border border-emerald-100">
                <span className="text-[10px] text-emerald-800 font-semibold block">1. Tiền thuê</span>
                <strong className="text-emerald-700 font-bold text-sm">{formatVND(booking.total_rent)}</strong>
              </div>
              <div className="rounded-xl bg-sky-50/50 p-2 border border-sky-100">
                <span className="text-[10px] text-sky-800 font-semibold block">2. Cọc giữ lịch</span>
                <strong className="text-sky-800 font-bold">{formatVND(booking.deposit_holding_required || 0)}</strong>
              </div>
              <div className="rounded-xl bg-indigo-50/50 p-2 border border-indigo-100">
                <span className="text-[10px] text-indigo-800 font-semibold block">3. Cọc thế chân</span>
                <strong className="text-indigo-800 font-bold">{formatVND(booking.deposit_security_required || booking.deposit_required || 0)}</strong>
              </div>
            </div>

            {/* Workflow Action Controls */}
            {booking.status === 'confirmed' && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-blue-950 text-xs">Bàn giao máy cho khách</h4>
                    <p className="text-[11px] text-blue-800">
                      Thu tiền thuê + Thu cọc thế chân. Cọc giữ lịch (nếu có) sẽ được cấn trừ/hoàn trả.
                    </p>
                  </div>
                  <button
                    onClick={handleHandoverToCustomer}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 font-bold text-white shadow-xs active:scale-95 transition"
                  >
                    <span>Giao máy cho khách</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {booking.status === 'active' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div>
                  <h4 className="font-bold text-amber-950 text-xs">Quy trình nhận lại máy & Hoàn cọc thế chân</h4>
                  <p className="text-[11px] text-amber-800">
                    Kiểm tra tình trạng thân vỏ, kính lens, phụ kiện. Nhập phụ phí (nếu trễ giờ/hao hụt) để trừ trực tiếp vào tiền cọc thế chân.
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
                          (booking.deposit_security_received || booking.deposit_received || 0) - Number(returnExtraFee)
                        )
                      )}
                    </strong>
                  </span>

                  <button
                    onClick={handleCompleteReturn}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 font-bold text-white shadow-xs active:scale-95 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Nhận máy & Hoàn cọc</span>
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
                <span>Xóa đơn thuê này</span>
              </button>

              {(booking.status === 'confirmed' || booking.status === 'draft') && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline px-2 py-1"
                >
                  Hủy đơn thuê
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
        title="Xác nhận hủy đơn thuê"
        itemName={booking ? `${booking.booking_code} - ${customer?.name || 'Khách'}` : ''}
        itemType="đơn thuê"
        description="Bạn có chắc chắn muốn hủy đơn thuê này? Thiết bị trong đơn sẽ được chuyển lại trạng thái sẵn sàng trong kho."
        confirmButtonText="Xác nhận hủy đơn"
      />

      {/* Permanent Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Xóa vĩnh viễn đơn thuê"
        itemName={booking ? `${booking.booking_code} (${customer?.name || 'Khách'})` : ''}
        itemType="đơn thuê"
        description="Đơn thuê này và tất cả các mục thiết bị, bút toán giao dịch liên quan sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu. Hành động này không thể hoàn tác!"
        confirmButtonText="Xác nhận xóa vĩnh viễn"
      />
    </GlassModal>
  );
};
