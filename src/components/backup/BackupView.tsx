import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  FileCode,
  AlertTriangle,
  CheckCircle,
  HardDrive,
  ShieldCheck,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { clearAllBookingsAndTransactions, resetDatabaseToDefault, wipeEntireDatabase } from '../../db/seedData.ts';
import {
  exportDatabaseToJSON,
  exportDatabaseToExcel,
  importDatabaseFromJSON,
  importDatabaseFromExcel,
} from '../../utils/backup.ts';
import { formatDateTimeVN } from '../../utils/formatters.ts';
import { useBackupReminder } from '../../hooks/useBackupReminder.ts';

export const BackupView: React.FC = () => {
  const { daysSinceBackup, lastBackupDate, shouldAlert, refreshBackupStatus } = useBackupReminder();

  const equipmentCount = useLiveQuery(() => db.equipment.count()) || 0;
  const customersCount = useLiveQuery(() => db.customers.count()) || 0;
  const bookingsCount = useLiveQuery(() => db.bookings.count()) || 0;
  const transactionsCount = useLiveQuery(() => db.transactions.count()) || 0;

  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showWipeBookingsModal, setShowWipeBookingsModal] = useState(false);
  const [showWipeAllModal, setShowWipeAllModal] = useState(false);
  const [showResetDbModal, setShowResetDbModal] = useState(false);

  const handleExportJSON = async () => {
    try {
      setIsExportingJson(true);
      setFeedback(null);
      await exportDatabaseToJSON();
      await refreshBackupStatus();
      setFeedback({
        type: 'success',
        message: 'Đã xuất file CineRent_Backup.json thành công! Bạn có thể lưu vào Google Drive hoặc chuyển sang máy khác.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Lỗi xuất file: ${err?.message || 'Thất bại'}` });
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      setFeedback(null);
      await exportDatabaseToExcel();
      await refreshBackupStatus();
      setFeedback({
        type: 'success',
        message: 'Đã xuất file CineRent_Data.xlsx đa sheet thành công! Tương thích với Microsoft Excel, Google Sheets.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Lỗi xuất file Excel: ${err?.message || 'Thất bại'}` });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setFeedback(null);

      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.json')) {
        const text = await file.text();
        const res = await importDatabaseFromJSON(text, importMode);
        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          await refreshBackupStatus();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        const buffer = await file.arrayBuffer();
        const res = await importDatabaseFromExcel(buffer);
        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          await refreshBackupStatus();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      } else {
        setFeedback({
          type: 'error',
          message: 'Vui lòng chọn file sao lưu định dạng .json, .xlsx hoặc .csv',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Lỗi import file: ${err?.message || 'Thất bại'}` });
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleWipeEntireDatabase = async () => {
    try {
      await wipeEntireDatabase();
      await refreshBackupStatus();
      setFeedback({
        type: 'success',
        message: 'Đã xóa sạch toàn bộ dữ liệu (trắng 100%)! Bạn có thể bắt đầu nạp file Excel riêng của mình.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Lỗi xóa dữ liệu: ${err?.message || 'Thất bại'}` });
    }
  };

  const handleWipeBookings = async () => {
    try {
      await clearAllBookingsAndTransactions();
      await refreshBackupStatus();
      setFeedback({
        type: 'success',
        message: 'Đã xóa toàn bộ đơn thuê và sổ quỹ thử nghiệm! Toàn bộ thiết bị trong kho đã trở về trạng thái sẵn sàng.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Lỗi xóa đơn thuê: ${err?.message || 'Thất bại'}` });
    }
  };

  const handleResetDatabase = async () => {
    try {
      await resetDatabaseToDefault();
      await refreshBackupStatus();
      setFeedback({
        type: 'success',
        message: 'Đã nạp lại dữ liệu máy mẫu CineRent (Canon R50, R6...) thành công!',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Lỗi đặt lại dữ liệu: ${err?.message || 'Thất bại'}` });
    }
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Top Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Database className="w-6 h-6 text-cyan-600" />
          <span>Sao Lưu & Đồng Bộ File Excel / JSON</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Dữ liệu lưu 100% Offline trong IndexedDB. Xuất file về máy và nhập lại ở máy khác để chuyển đổi thiết bị dễ dàng.
        </p>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`flex items-start gap-2.5 rounded-2xl border p-4 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-semibold text-sm">{feedback.message}</span>
        </div>
      )}

      {/* Backup Status Alert Card */}
      <GlassCard
        variant={shouldAlert ? 'default' : 'glow'}
        className={shouldAlert ? 'border-rose-300 bg-rose-50/50' : ''}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-2xl p-2.5 shrink-0 ${
                shouldAlert ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {shouldAlert ? (
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>

            <div>
              <h2 className="font-bold text-slate-900 text-base">
                {shouldAlert ? 'CẦN XUẤT FILE SAO LƯU DỮ LIỆU!' : 'Trạng thái dữ liệu an toàn'}
              </h2>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                <span>
                  Lần sao lưu gần nhất:{' '}
                  <strong className="text-slate-900">
                    {lastBackupDate ? formatDateTimeVN(lastBackupDate) : 'Chưa có dữ liệu'}
                  </strong>
                </span>
                <span>•</span>
                <span className={shouldAlert ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                  {daysSinceBackup >= 999 ? 'Chưa từng backup' : `Cách đây ${daysSinceBackup} ngày`}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportJSON}
            disabled={isExportingJson}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingJson ? 'Đang xuất...' : 'Xuất Backup (.json) ngay'}</span>
          </button>
        </div>
      </GlassCard>

      {/* Two Columns: Export & Import */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Module A: Export Options */}
        <GlassCard>
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Download className="w-5 h-5 text-cyan-600" />
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">1. Xuất Dữ Liệu (Backup)</h3>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Tải dữ liệu về máy để lưu trữ hoặc chuyển sang điện thoại/máy tính khác:
          </p>

          <div className="space-y-3 mt-4">
            {/* JSON Export */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-cyan-100 p-2 text-cyan-700 shrink-0">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">File JSON Chuẩn</h4>
                  <p className="text-[11px] text-slate-500">
                    Bảo toàn 100% quan hệ bảng, checklist phụ kiện và trạng thái
                  </p>
                </div>
              </div>

              <button
                onClick={handleExportJSON}
                disabled={isExportingJson}
                className="rounded-lg bg-white border border-slate-200 hover:bg-cyan-600 hover:text-white px-3 py-1.5 text-xs font-bold text-cyan-700 transition shadow-xs"
              >
                {isExportingJson ? 'Đang tạo...' : 'Tải JSON'}
              </button>
            </div>

            {/* Excel Export */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">File Excel (.xlsx)</h4>
                  <p className="text-[11px] text-slate-500">
                    Tương thích cấu trúc cột: id, tenMay, loai, gia1Ngay, cocTheChan...
                  </p>
                </div>
              </div>

              <button
                onClick={handleExportExcel}
                disabled={isExportingExcel}
                className="rounded-lg bg-white border border-slate-200 hover:bg-emerald-600 hover:text-white px-3 py-1.5 text-xs font-bold text-emerald-700 transition shadow-xs"
              >
                {isExportingExcel ? 'Đang tạo...' : 'Tải Excel'}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Module B: Import & Restore */}
        <GlassCard>
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Upload className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">2. Nhập & Khôi Phục Dữ Liệu</h3>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Nạp file (.json, .xlsx hoặc .csv như bảng mẫu của bạn) để đồng bộ vào ứng dụng.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Chế độ nạp dữ liệu:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setImportMode('overwrite')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    importMode === 'overwrite'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <strong className="block text-slate-900">Ghi đè (Restore)</strong>
                  <span className="text-[10px] text-slate-500 font-normal">Thay thế toàn bộ bằng dữ liệu file</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    importMode === 'merge'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <strong className="block text-slate-900">Gộp thêm (Merge)</strong>
                  <span className="text-[10px] text-slate-500 font-normal">Cập nhật mã trùng và thêm mới</span>
                </button>
              </div>
            </div>

            <label className="cursor-pointer flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-cyan-500 transition">
              <Upload className="w-8 h-8 text-cyan-600 mb-2" />
              <span className="text-xs font-bold text-slate-800">
                {isImporting ? 'Đang xử lý dữ liệu...' : 'Chọn file .json, .xlsx hoặc .csv để nhập'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                Tự động chuẩn hóa định dạng ngày giờ dd/mm/yyyy
              </span>
              <input
                type="file"
                accept=".json,.xlsx,.xls,.csv"
                onChange={handleFileImport}
                disabled={isImporting}
                className="hidden"
              />
            </label>
          </div>
        </GlassCard>
      </div>

      {/* Storage Breakdown */}
      <GlassCard>
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <HardDrive className="w-4 h-4 text-cyan-600" />
          <h3 className="font-bold text-slate-900 text-sm">
            Thống kê Bản ghi Offline trong Trình duyệt (IndexedDB)
          </h3>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 block text-[10px]">Thiết bị</span>
            <strong className="text-lg font-black text-cyan-700">{equipmentCount}</strong>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 block text-[10px]">Khách hàng</span>
            <strong className="text-lg font-black text-emerald-700">{customersCount}</strong>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 block text-[10px]">Đơn thuê</span>
            <strong className="text-lg font-black text-amber-700">{bookingsCount}</strong>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 block text-[10px]">Bút toán sổ quỹ</span>
            <strong className="text-lg font-black text-rose-700">{transactionsCount}</strong>
          </div>
        </div>
      </GlassCard>

      {/* Danger Zone: Wipe Test Data or Reset Everything */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-3 border-b border-rose-200/70">
          <Trash2 className="w-5 h-5 text-rose-600" />
          <div>
            <h3 className="font-black text-rose-950 text-sm">Vùng Quản Trị & Xóa Dữ Liệu Thử Nghiệm</h3>
            <p className="text-[11px] text-rose-700">
              Công cụ dọn dẹp các đơn test, xóa sổ quỹ hoặc đưa hệ thống về trạng thái ban đầu.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Option 1: Wipe 100% */}
          <div className="rounded-xl border border-rose-300 bg-rose-50/50 p-4 flex flex-col justify-between gap-3 shadow-2xs">
            <div>
              <span className="inline-block px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wider mb-1.5">
                Khuyên Dùng Trước Khi Nạp File
              </span>
              <h4 className="font-black text-rose-950 text-sm">Xóa Hết Toàn Bộ Dữ Liệu (Trắng 100%)</h4>
              <p className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                Xóa sạch 100% thiết bị, khách hàng, đơn thuê và sổ quỹ để bạn nhập file Excel riêng từ máy khác mà không bị lẫn máy mẫu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowWipeAllModal(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa trắng 100% toàn bộ</span>
            </button>
          </div>

          {/* Option 2: Wipe Bookings only */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-xs sm:text-sm">Xóa Toàn Bộ Đơn Thuê & Sổ Quỹ</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Chỉ xóa các đơn thuê và giao dịch thử nghiệm; giữ nguyên danh mục thiết bị và danh bạ khách hàng.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowWipeBookingsModal(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white transition active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa đơn thuê & Sổ quỹ</span>
            </button>
          </div>

          {/* Option 3: Restore Demo Data */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-xs sm:text-sm">Nạp Lại Dữ Liệu Máy Mẫu</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Nạp lại kho máy ảnh mẫu (Canon R50, R6...) và thông tin cho thuê Châu Nguyễn Phương Thanh nếu cần xem lại.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowResetDbModal(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-600 hover:text-white transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Nạp lại máy mẫu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Wipe All 100% Modal */}
      <DeleteConfirmModal
        isOpen={showWipeAllModal}
        onClose={() => setShowWipeAllModal(false)}
        onConfirm={handleWipeEntireDatabase}
        title="Xác nhận xóa sạch 100% dữ liệu?"
        itemName="Toàn bộ kho thiết bị, danh bạ khách hàng, đơn thuê & sổ quỹ"
        itemType="hệ thống"
        description="Ứng dụng sẽ xóa sạch toàn bộ các bảng trong cơ sở dữ liệu IndexedDB, không để lại bản ghi nào. Bạn sẽ có một ứng dụng trắng tinh để sẵn sàng nạp file Excel riêng của mình."
        confirmButtonText="Đồng ý xóa trắng 100%"
      />

      {/* Wipe Bookings Modal */}
      <DeleteConfirmModal
        isOpen={showWipeBookingsModal}
        onClose={() => setShowWipeBookingsModal(false)}
        onConfirm={handleWipeBookings}
        title="Xác nhận xóa sạch đơn thuê và sổ quỹ?"
        itemName={`${bookingsCount} đơn thuê & ${transactionsCount} giao dịch sổ quỹ`}
        itemType="dữ liệu đơn thuê"
        description="Toàn bộ lịch thuê và bút toán thu chi sẽ bị xóa vĩnh viễn. Tất cả thiết bị sẽ được chuyển về trạng thái Sẵn sàng cho thuê trong kho."
        confirmButtonText="Đồng ý xóa sạch"
      />

      {/* Reset DB Modal */}
      <DeleteConfirmModal
        isOpen={showResetDbModal}
        onClose={() => setShowResetDbModal(false)}
        onConfirm={handleResetDatabase}
        title="Nạp lại dữ liệu máy mẫu ban đầu?"
        itemName="Dữ liệu mẫu CineRent (Canon R50, R6...)"
        itemType="dữ liệu mẫu"
        description="Ứng dụng sẽ nạp lại các thiết bị và khách hàng mẫu mặc định. Bạn có thể xóa bất cứ lúc nào."
        confirmButtonText="Nạp máy mẫu"
      />
    </div>
  );
};
