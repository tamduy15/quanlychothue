import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { GlassModal } from './GlassModal.tsx';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  itemName?: string;
  itemType?: string;
  description?: string;
  confirmButtonText?: string;
  isDangerous?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType = 'mục',
  description,
  confirmButtonText = 'Xác nhận xóa',
  isDangerous = true,
}) => {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Error during deletion:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={isDeleting ? () => {} : onClose}
      title={title}
      maxWidth="md"
    >
      <div className="p-2 sm:p-4 text-center">
        {/* Warning Icon with Pulsing Effect */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mb-4 ring-8 ring-rose-50">
          <Trash2 className="h-7 w-7 animate-bounce-subtle" />
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-black text-slate-900 mb-2">
          {title}
        </h3>

        {/* Item Highlight Box */}
        {itemName && (
          <div className="my-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs sm:text-sm text-rose-950 font-bold break-words">
            {itemName}
          </div>
        )}

        {/* Description */}
        <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
          {description || (
            <>
              Bạn có chắc chắn muốn xóa {itemType} này khỏi hệ thống?{' '}
              <strong className="text-rose-600">Hành động này không thể hoàn tác.</strong>
            </>
          )}
        </p>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition active:scale-95 disabled:opacity-50"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:brightness-105 transition active:scale-95 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Đang xóa...' : confirmButtonText}</span>
          </button>
        </div>
      </div>
    </GlassModal>
  );
};
