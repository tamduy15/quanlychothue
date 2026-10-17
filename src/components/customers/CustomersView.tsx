import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  Search,
  Plus,
  Phone,
  CreditCard,
  MapPin,
  Edit,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { GlassModal } from '../common/GlassModal.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { TRUST_LEVEL_MAP } from '../../utils/formatters.ts';
import type { Customer, CustomerTrustLevel } from '../../types/index.ts';

export const CustomersView: React.FC = () => {
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const bookings = useLiveQuery(() => db.bookings.toArray()) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [trustFilter, setTrustFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [identityCard, setIdentityCard] = useState('');
  const [address, setAddress] = useState('');
  const [facebookZalo, setFacebookZalo] = useState('');
  const [trustLevel, setTrustLevel] = useState<CustomerTrustLevel>('normal');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const bookingCountMap = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const b of bookings) {
      map.set(b.customer_id, (map.get(b.customer_id) || 0) + 1);
    }
    return map;
  }, [bookings]);

  const filteredCustomers = customers.filter((c) => {
    if (trustFilter !== 'all' && c.trust_level !== trustFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchPhone = (c.phone || '').toLowerCase().includes(q);
      const matchCCCD = (c.identity_card || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchCCCD;
    }
    return true;
  });

  const handleOpenModal = (cust?: Customer) => {
    if (cust) {
      setEditingCustomer(cust);
      setName(cust.name);
      setPhone(cust.phone || '');
      setEmail(cust.email || '');
      setIdentityCard(cust.identity_card || '');
      setAddress(cust.address || '');
      setFacebookZalo(cust.facebook_zalo || '');
      setTrustLevel(cust.trust_level);
      setNotes(cust.notes || '');
    } else {
      setEditingCustomer(null);
      setName('');
      setPhone('');
      setEmail('');
      setIdentityCard('');
      setAddress('');
      setFacebookZalo('');
      setTrustLevel('normal');
      setNotes('');
    }
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Rule: Tên là điều kiện bắt buộc duy nhất
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập Tên khách hàng (Bắt buộc).');
      return;
    }

    try {
      const custData: Customer = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        identity_card: identityCard.trim() || undefined,
        address: address.trim() || undefined,
        facebook_zalo: facebookZalo.trim() || undefined,
        trust_level: trustLevel,
        notes: notes.trim() || undefined,
        created_at: editingCustomer?.created_at || new Date().toISOString(),
      };

      if (editingCustomer && editingCustomer.id) {
        await db.customers.update(editingCustomer.id, custData as any);
      } else {
        await db.customers.add(custData);
      }

      setModalOpen(false);
    } catch (err: any) {
      setErrorMsg('Lỗi lưu khách hàng: ' + (err?.message || 'Thất bại'));
    }
  };

  const handleDelete = (cust: Customer) => {
    if (!cust.id) return;
    setDeletingCustomer(cust);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCustomer?.id) return;
    await db.customers.delete(deletingCustomer.id);
    setDeletingCustomer(null);
  };

  return (
    <div className="space-y-5 text-slate-800">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-cyan-600" />
            <span>Danh Bạ Khách Hàng</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Chỉ cần Tên khách hàng là bắt buộc, các thông tin khác có thể bổ sung sau.
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm khách hàng</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên khách, số điện thoại, CCCD..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-none shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 scrollbar-none">
          <button
            onClick={() => setTrustFilter('all')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-bold transition ${
              trustFilter === 'all'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Tất cả ({customers.length})
          </button>
          <button
            onClick={() => setTrustFilter('vip')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-bold transition ${
              trustFilter === 'vip'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            VIP
          </button>
          <button
            onClick={() => setTrustFilter('verified')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-bold transition ${
              trustFilter === 'verified'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Đã xác minh
          </button>
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((cust) => {
          const trustConfig = TRUST_LEVEL_MAP[cust.trust_level] || TRUST_LEVEL_MAP.normal;
          const rentalCount = bookingCountMap.get(cust.id!) || 0;

          return (
            <GlassCard key={cust.id} className="flex flex-col justify-between hover:shadow-md transition">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-900 text-base truncate">{cust.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${trustConfig.bg}`}>
                    {trustConfig.label}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                  {cust.phone ? (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <a href={`tel:${cust.phone}`} className="text-cyan-700 font-bold hover:underline">
                        {cust.phone}
                      </a>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">Chưa lưu số điện thoại</div>
                  )}

                  {cust.identity_card && (
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-slate-700">CCCD: {cust.identity_card}</span>
                    </div>
                  )}

                  {cust.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="text-slate-600 line-clamp-1">{cust.address}</span>
                    </div>
                  )}

                  {cust.notes && (
                    <p className="text-[11px] text-slate-500 italic line-clamp-2 pt-1 border-t border-slate-100">
                      "{cust.notes}"
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-3 text-xs">
                <span className="text-slate-500">
                  Lịch sử: <strong className="text-cyan-700">{rentalCount} đơn</strong>
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenModal(cust)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    title="Chỉnh sửa"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cust)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    title="Xóa khách"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Customer Modal */}
      <GlassModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Chỉnh sửa Khách hàng' : 'Thêm Khách hàng Mới'}
        subtitle="Chỉ cần tên là bắt buộc, các trường khác có thể để trống"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-800">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Họ và tên khách <span className="text-rose-500 font-bold">* (Bắt buộc)</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nguyễn Văn Nam"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Số điện thoại (Không bắt buộc)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0908123456"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Số CCCD / CMND (Không bắt buộc)
              </label>
              <input
                type="text"
                value={identityCard}
                onChange={(e) => setIdentityCard(e.target.value)}
                placeholder="001095018274"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@gmail.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hạng tín nhiệm</label>
              <select
                value={trustLevel}
                onChange={(e) => setTrustLevel(e.target.value as CustomerTrustLevel)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
              >
                <option value="normal">Khách thường / Mới</option>
                <option value="verified">Đã xác minh CCCD</option>
                <option value="vip">VIP Uy tín</option>
                <option value="blacklisted">Cảnh báo rủi ro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Địa chỉ</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Địa chỉ thường trú..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ghi chú</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú thêm về khách..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
            ></textarea>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 font-bold text-white shadow-xs hover:brightness-105 active:scale-95"
            >
              {editingCustomer ? 'Cập nhật' : 'Thêm khách hàng'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        onConfirm={handleConfirmDelete}
        title="Xác nhận xóa hồ sơ khách hàng"
        itemName={deletingCustomer ? `${deletingCustomer.name} (${deletingCustomer.phone || 'Chưa có SĐT'})` : ''}
        itemType="khách hàng"
        description="Bạn có chắc chắn muốn xóa khách hàng này khỏi danh bạ? Các dữ liệu lịch sử đơn thuê trước đây vẫn được lưu trong hệ thống."
        confirmButtonText="Xác nhận xóa khách hàng"
      />
    </div>
  );
};
