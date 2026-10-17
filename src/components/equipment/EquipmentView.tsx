import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Camera,
  Search,
  Plus,
  Filter,
  Edit,
  Trash2,
  Package,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { EquipmentModal } from './EquipmentModal.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { formatVND, EQUIPMENT_STATUS_MAP } from '../../utils/formatters.ts';
import type { Equipment } from '../../types/index.ts';

interface EquipmentViewProps {
  onOpenNewBookingWithEquipment?: (equipmentId: number) => void;
}

export const EquipmentView: React.FC<EquipmentViewProps> = ({
  onOpenNewBookingWithEquipment,
}) => {
  const equipment = useLiveQuery(() => db.equipment.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [deletingEquipment, setDeletingEquipment] = useState<Equipment | null>(null);

  const catMap = React.useMemo(() => {
    return new Map(categories.map((c) => [c.id, c.name]));
  }, [categories]);

  const filteredEquipment = equipment.filter((item) => {
    if (selectedCategory !== 'all' && item.category_id !== selectedCategory) {
      return false;
    }
    if (selectedStatus !== 'all' && item.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = item.asset_code.toLowerCase().includes(q);
      const matchName = item.name.toLowerCase().includes(q);
      const matchBrand = (item.brand || '').toLowerCase().includes(q);
      const matchSerial = (item.serial_number || '').toLowerCase().includes(q);
      return matchCode || matchName || matchBrand || matchSerial;
    }
    return true;
  });

  const handleEdit = (eq: Equipment) => {
    setEditingEquipment(eq);
    setModalOpen(true);
  };

  const handleDelete = (eq: Equipment) => {
    if (!eq.id) return;
    setDeletingEquipment(eq);
  };

  const handleConfirmDelete = async () => {
    if (!deletingEquipment?.id) return;
    await db.equipment.delete(deletingEquipment.id);
    setDeletingEquipment(null);
  };

  return (
    <div className="space-y-5 text-slate-800">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-cyan-600" />
            <span>Kho Thiết Bị Cho Thuê</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Tổng cộng {equipment.length} máy trong kho thiết bị.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingEquipment(null);
            setModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm thiết bị mới</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo Mã máy, tên máy, model, số serial..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-none shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 hidden sm:block" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none shadow-xs"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="available">Sẵn sàng (Hoạt động)</option>
            <option value="rented">Đang cho thuê</option>
            <option value="maintenance">Bảo dưỡng</option>
            <option value="retired">Ngừng khai thác</option>
          </select>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`shrink-0 rounded-xl px-3 py-1.5 font-bold transition ${
            selectedCategory === 'all'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs'
          }`}
        >
          Tất cả ({equipment.length})
        </button>
        {categories.map((c) => {
          const count = equipment.filter((e) => e.category_id === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id!)}
              className={`shrink-0 rounded-xl px-3 py-1.5 font-bold transition ${
                selectedCategory === c.id
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              {c.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Equipment Cards Grid */}
      {filteredEquipment.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">
          <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">Chưa có thiết bị nào</p>
          <p className="text-xs text-slate-500 mt-1">Hãy thêm thiết bị mới hoặc nhập từ file Excel.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEquipment.map((eq) => {
            const statusConfig = EQUIPMENT_STATUS_MAP[eq.status] || EQUIPMENT_STATUS_MAP.available;
            const categoryName = catMap.get(eq.category_id) || 'Máy ảnh';
            const displayImage = eq.image_url || eq.photo_base64;

            return (
              <GlassCard
                key={eq.id}
                className="flex flex-col justify-between hover:shadow-md transition group"
              >
                <div>
                  {/* Top Bar: Asset Code & Status */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      {eq.asset_code}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusConfig.bg} ${statusConfig.border}`}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Thumbnail & Title */}
                  <div className="flex gap-3 mb-3">
                    {displayImage ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 shadow-2xs">
                        <img
                          src={displayImage}
                          alt={eq.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // fallback on image broken
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Camera className="w-6 h-6 text-slate-400" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] text-slate-500 font-medium block truncate">
                        {categoryName} {eq.brand && `• ${eq.brand}`}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug">
                        {eq.name}
                      </h3>
                      {eq.serial_number && (
                        <span className="text-[10px] text-slate-400 font-mono block">
                          S/N: {eq.serial_number}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pricing Box with 6h / 1d / 2d */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-1 mb-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-[11px]">Giá 1 ngày (24h):</span>
                      <strong className="text-emerald-700 font-bold text-sm">
                        {formatVND(eq.daily_rate)}
                      </strong>
                    </div>
                    {eq.rate_6h ? (
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Giá gói 6h:</span>
                        <span className="font-semibold text-slate-700">{formatVND(eq.rate_6h)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                      <span>Cọc thế chân:</span>
                      <span className="font-semibold text-indigo-700">{formatVND(eq.deposit_rate)}</span>
                    </div>
                  </div>

                  {/* Accessories */}
                  {eq.accessories && eq.accessories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {eq.accessories.slice(0, 3).map((acc) => (
                        <span
                          key={acc}
                          className="inline-flex items-center text-[10px] rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-slate-600 font-medium"
                        >
                          {acc}
                        </span>
                      ))}
                      {eq.accessories.length > 3 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{eq.accessories.length - 3} món
                        </span>
                      )}
                    </div>
                  )}

                  {eq.notes && (
                    <p className="text-[11px] text-slate-500 line-clamp-1 italic mb-2">
                      "{eq.notes}"
                    </p>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(eq)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                      title="Chỉnh sửa thiết bị"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(eq)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Xóa thiết bị"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {eq.status === 'available' && onOpenNewBookingWithEquipment && eq.id && (
                    <button
                      onClick={() => onOpenNewBookingWithEquipment(eq.id!)}
                      className="rounded-lg bg-cyan-50 border border-cyan-300 px-3 py-1 text-xs font-bold text-cyan-800 hover:bg-cyan-600 hover:text-white transition shadow-2xs"
                    >
                      + Tạo đơn thuê
                    </button>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Equipment Add / Edit Modal */}
      <EquipmentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingEquipment(null);
        }}
        equipmentToEdit={editingEquipment}
        categories={categories}
        onSaved={() => {
          setModalOpen(false);
          setEditingEquipment(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingEquipment}
        onClose={() => setDeletingEquipment(null)}
        onConfirm={handleConfirmDelete}
        title="Xác nhận xóa thiết bị"
        itemName={deletingEquipment ? `${deletingEquipment.name} (${deletingEquipment.asset_code})` : ''}
        itemType="thiết bị"
        description="Bạn có chắc chắn muốn xóa thiết bị này khỏi danh mục kho? Hành động này không thể hoàn tác."
        confirmButtonText="Xác nhận xóa thiết bị"
      />
    </div>
  );
};
