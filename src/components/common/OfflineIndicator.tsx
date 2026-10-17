import React from 'react';
import { WifiOff, ShieldCheck } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.ts';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-700 shadow-xs">
      {isOnline ? (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Offline Ready</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3 text-amber-600" />
          <span className="text-amber-700 font-bold">Ngoại tuyến (Offline)</span>
        </>
      )}
      <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 ml-0.5" />
    </div>
  );
};
