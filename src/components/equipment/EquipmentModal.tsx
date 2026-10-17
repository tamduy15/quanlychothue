import React, { useState, useEffect } from 'react';
import { Camera, Upload, Trash2, AlertCircle } from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassModal } from '../common/GlassModal.tsx';
import { compressImageFile } from '../../utils/imageCompression.ts';
import { generateShortEquipmentCode } from '../../utils/bookingHelpers.ts';
import type { Equipment, Category, EquipmentStatus, EquipmentCondition } from '../../types/index.ts';

interface EquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentToEdit?: Equipment | null;
  categories: Category[];
  onSaved: () => void;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 1, name: 'Máy ảnh', slug: 'camera' },
  { id: 2, name: 'Ống kính (Lens)', slug: 'lens' },
  { id: 3, name: 'Chống rung (Gimbal)', slug: 'gimbal' },
  { id: 4, name: 'Phụ kiện & Pin', slug: 'accessories' },
];

export const EquipmentModal: React.FC<EquipmentModalProps> = ({
  isOpen,
  onClose,
  equipmentToEdit,
  categories,
  onSaved,
}) => {
  const effectiveCategories = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  const [assetCode, setAssetCode] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [brand, setBrand] = useState('Canon');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [rate6h, setRate6h] = useState<number>(100000);
  const [dailyRate, setDailyRate] = useState<number>(150000);
  const [rate2days, setRate2days] = useState<number>(250000);
  const [depositRate, setDepositRate] = useState<number>(500000);
  const [keepCCCD, setKeepCCCD] = useState(true);
  const [status, setStatus] = useState<EquipmentStatus>('available');
  const [condition, setCondition] = useState<EquipmentCondition>('good');
  const [accessories, setAccessories] = useState<string[]>([]);
  const [newAccessory, setNewAccessory] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const defaultCatId = effectiveCategories[0]?.id || 1;
    if (equipmentToEdit) {
      setAssetCode(equipmentToEdit.asset_code);
      setName(equipmentToEdit.name);
      setCategoryId(equipmentToEdit.category_id || defaultCatId);
      setBrand(equipmentToEdit.brand || 'Canon');
      setModel(equipmentToEdit.model || '');
      setSerialNumber(equipmentToEdit.serial_number || '');
      setRate6h(equipmentToEdit.rate_6h ?? 0);
      setDailyRate(equipmentToEdit.daily_rate ?? 0);
      setRate2days(equipmentToEdit.rate_2days ?? 0);
      setDepositRate(equipmentToEdit.deposit_rate ?? 0);
      setKeepCCCD(Boolean(equipmentToEdit.keep_cccd));
      setStatus(equipmentToEdit.status);
      setCondition(equipmentToEdit.condition);
      setAccessories(equipmentToEdit.accessories || []);
      setPhotoBase64(equipmentToEdit.photo_base64);
      setImageUrl(equipmentToEdit.image_url || '');
      setNotes(equipmentToEdit.notes || '');
    } else {
      db.equipment.toArray().then((allEq) => {
        const shortCode = generateShortEquipmentCode(allEq.map((e) => e.asset_code));
        setAssetCode(shortCode);
      });
      setName('');
      setCategoryId(defaultCatId);
      setBrand('Canon');
      setModel('EOS R50');
      setSerialNumber('');
      setRate6h(100000);
      setDailyRate(150000);
      setRate2days(250000);
      setDepositRate(500000);
      setKeepCCCD(true);
      setStatus('available');
      setCondition('good');
      setAccessories(['1x Pin LP-E17', '1x Củ sạc', '1x Dây đeo', '1x Thẻ nhớ 64GB', '1x Túi máy']);
      setPhotoBase64(undefined);
      setImageUrl('');
      setNotes('');
    }
    setErrorMsg('');
  }, [equipmentToEdit, isOpen, categories]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 800, 0.75);
      setPhotoBase64(compressed);
    } catch (err: any) {
      setErrorMsg('Không thể nén ảnh: ' + (err?.message || 'Lỗi'));
    }
  };

  const handleAddAccessory = () => {
    if (!newAccessory.trim()) return;
    if (!accessories.includes(newAccessory.trim())) {
      setAccessories([...accessories, newAccessory.trim()]);
    }
    setNewAccessory('');
  };

  const handleRemoveAccessory = (acc: string) => {
    setAccessories(accessories.filter((a) => a !== acc));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập Tên thiết bị.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      // Auto-generate short code if empty
      const allEq = await db.equipment.toArray();
      const finalCode = assetCode.trim() || generateShortEquipmentCode(allEq.map((e) => e.asset_code));

      // Ensure categories table has records
      const catCount = await db.categories.count();
      if (catCount === 0) {
        await db.categories.bulkAdd(DEFAULT_CATEGORIES);
      }

      const existing = await db.equipment.where('asset_code').equals(finalCode).first();
      if (existing && (!equipmentToEdit || existing.id !== equipmentToEdit.id)) {
        setErrorMsg(`Mã tài sản "${finalCode}" đã tồn tại trên hệ thống.`);
        setIsSubmitting(false);
        return;
      }

      const eqData: Equipment = {
        asset_code: finalCode,
        name: name.trim(),
        category_id: Number(categoryId) || 1,
        brand: brand.trim(),
        model: model.trim(),
        serial_number: serialNumber.trim(),
        rate_6h: Number(rate6h) || 0,
        daily_rate: Number(dailyRate) || 0,
        rate_2days: Number(rate2days) || 0,
        deposit_rate: Number(depositRate) || 0,
        keep_cccd: keepCCCD,
        status,
        condition,
        accessories,
        photo_base64: photoBase64,
        image_url: imageUrl.trim() || undefined,
        notes: notes.trim(),
        created_at: equipmentToEdit?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (equipmentToEdit && equipmentToEdit.id) {
        await db.equipment.update(equipmentToEdit.id, eqData as any);
      } else {
        await db.equipment.add(eqData);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg('Lỗi lưu thiết bị: ' + (err?.message || 'Thất bại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={equipmentToEdit ? 'Chỉnh sửa Thiết bị' : 'Thêm Thiết bị Mới'}
      subtitle="Quản lý tài sản theo định dạng chuẩn tương thích file Excel"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-800">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Row 1: Asset Code & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Mã máy (Asset Code) <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
              placeholder="VD: MAY-20260816-..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Phân loại thiết bị
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
            >
              {effectiveCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Name */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Tên thiết bị <span className="text-rose-500 font-bold">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: [Trắng] Canon R50 hoặc Canon EOS R50"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
          />
        </div>

        {/* Row 3: Pricing Packages (gia6h, gia1Ngay, gia2Ngay) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-bold text-slate-900 block text-xs">Các gói giá thuê (VND)</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRate6h(0);
                  setDailyRate(0);
                  setRate2days(0);
                  setDepositRate(0);
                  setKeepCCCD(false);
                }}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition"
              >
                ⚡ Đồ đi kèm (0đ thuê & 0đ cọc)
              </button>
              <button
                type="button"
                onClick={() => {
                  setRate6h(100000);
                  setDailyRate(150000);
                  setRate2days(250000);
                  setDepositRate(500000);
                  setKeepCCCD(true);
                }}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition"
              >
                Mặc định máy ảnh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Giá thuê 6h</label>
              <input
                type="number"
                min="0"
                step="10000"
                value={rate6h}
                onChange={(e) => setRate6h(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-emerald-700 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Giá thuê 1 ngày (24h)</label>
              <input
                type="number"
                min="0"
                step="10000"
                value={dailyRate}
                onChange={(e) => setDailyRate(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-emerald-700 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Giá thuê 2 ngày (48h)</label>
              <input
                type="number"
                min="0"
                step="10000"
                value={rate2days}
                onChange={(e) => setRate2days(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-emerald-700 focus:outline-none shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Row 4: Deposit & CCCD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tiền cọc thế chân mặc định (VND)
            </label>
            <input
              type="number"
              min="0"
              step="50000"
              value={depositRate}
              onChange={(e) => setDepositRate(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-indigo-700 focus:border-cyan-500 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 text-xs">
              <input
                type="checkbox"
                checked={keepCCCD}
                onChange={(e) => setKeepCCCD(e.target.checked)}
                className="rounded accent-cyan-600 w-4 h-4 cursor-pointer"
              />
              <span>Giữ CCCD/CMND gốc làm tin khi thuê</span>
            </label>
          </div>
        </div>

        {/* Row 5: Status & Image link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Trạng thái máy</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipmentStatus)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none shadow-xs"
            >
              <option value="available">Sẵn sàng (Hoạt động)</option>
              <option value="rented">Đang cho thuê</option>
              <option value="maintenance">Bảo dưỡng / Sửa chữa</option>
              <option value="retired">Ngừng khai thác</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Link ảnh trực tuyến (Google Drive)</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none shadow-xs"
            />
          </div>
        </div>

        {/* Accessories */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Phụ kiện bàn giao kèm máy
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAccessory}
              onChange={(e) => setNewAccessory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAccessory();
                }
              }}
              placeholder="VD: 1x Pin, 1x Sạc, 1x Thẻ nhớ..."
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none shadow-xs"
            />
            <button
              type="button"
              onClick={handleAddAccessory}
              className="rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 font-bold text-slate-700 text-xs"
            >
              + Thêm
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {accessories.map((acc) => (
              <span
                key={acc}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
              >
                <span>{acc}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAccessory(acc)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Ghi chú thêm</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú về tình trạng máy..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none shadow-xs"
          ></textarea>
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
            disabled={isSubmitting}
            className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 font-bold text-white shadow-xs hover:brightness-105 active:scale-95"
          >
            {isSubmitting ? 'Đang lưu...' : equipmentToEdit ? 'Cập nhật' : 'Thêm vào kho'}
          </button>
        </div>
      </form>
    </GlassModal>
  );
};
