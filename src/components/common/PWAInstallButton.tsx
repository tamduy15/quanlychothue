import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA on home screen, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop prompt flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_2px_10px_rgba(6,182,212,0.4)] hover:brightness-110 active:scale-95 transition"
        title="Cài đặt CineRent vào màn hình chính"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Cài App PWA</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not natively fired in WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 shadow-sm hover:bg-cyan-900/50 active:scale-95 transition"
          title="Cài đặt CineRent vào iPhone/iPad"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Thêm vào màn hình chính</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-4 transition-opacity">
            <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" />
                  Cài đặt trên iOS Safari
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3 rounded-xl bg-slate-800/60 p-3">
                  <Share2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Bước 1:</span> Nhấn vào nút <strong>Chia sẻ (Share)</strong> ở thanh công cụ Safari dưới đáy màn hình.
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-slate-800/60 p-3">
                  <PlusSquare className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Bước 2:</span> Cuộn xuống và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
