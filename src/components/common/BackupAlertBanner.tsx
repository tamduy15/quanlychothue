import React from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { exportDatabaseToJSON } from '../../utils/backup.ts';

interface BackupAlertBannerProps {
  daysSinceBackup: number;
  onDismiss?: () => void;
  onNavigateToBackup?: () => void;
}

export const BackupAlertBanner: React.FC<BackupAlertBannerProps> = ({
  daysSinceBackup,
  onDismiss,
  onNavigateToBackup,
}) => {
  const [isExporting, setIsExporting] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  const handleQuickExport = async () => {
    try {
      setIsExporting(true);
      await exportDatabaseToJSON();
      setDismissed(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 shadow-xs">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 animate-pulse" />
          <span>
            <strong className="text-rose-950 font-bold">CẢNH BÁO BẢO TOÀN DỮ LIỆU:</strong>{' '}
            {daysSinceBackup >= 999
              ? 'Bạn chưa xuất file sao lưu lần nào!'
              : `Đã ${daysSinceBackup} ngày chưa xuất sao lưu.`}{' '}
            Dữ liệu lưu 100% trên máy này, hãy tải file backup về để không lo mất dữ liệu.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleQuickExport}
            disabled={isExporting}
            className="flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1 font-semibold text-white shadow-xs transition active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Đang xuất...' : 'Xuất Backup (.json)'}</span>
          </button>

          {onNavigateToBackup && (
            <button
              onClick={onNavigateToBackup}
              className="text-rose-700 hover:text-rose-900 underline text-xs font-medium"
            >
              Xem sao lưu
            </button>
          )}

          {onDismiss && (
            <button
              onClick={() => {
                setDismissed(true);
                onDismiss();
              }}
              className="rounded p-1 text-rose-500 hover:text-rose-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
