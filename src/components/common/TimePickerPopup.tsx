import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

interface TimePickerPopupProps {
  value: string; // HH:mm
  onChange: (newTime: string) => void;
  accentColor?: 'cyan' | 'amber' | 'blue';
  className?: string;
}

const ALL_TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const QUICK_HOURS = ['07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '15:00', '18:00', '20:00', '21:00'];

export const TimePickerPopup: React.FC<TimePickerPopupProps> = ({
  value,
  onChange,
  accentColor = 'blue',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSlotRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => {
        activeSlotRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 30);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const activeBg =
    accentColor === 'amber'
      ? 'bg-amber-600 text-white'
      : accentColor === 'cyan'
      ? 'bg-cyan-600 text-white'
      : 'bg-[#0068ff] text-white';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-1 rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-2xs transition cursor-pointer select-none ${
          isOpen
            ? 'border-[#0068ff] ring-2 ring-blue-100'
            : 'border-slate-300 hover:border-blue-400'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{value || '08:00'}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-[#0068ff]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl animate-in fade-in zoom-in-95 duration-100 space-y-2.5">
          {/* Quick Time Presets */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
              Giờ phổ biến (1 chạm)
            </span>
            <div className="grid grid-cols-5 gap-1">
              {QUICK_HOURS.map((t) => {
                const isSelected = value === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onChange(t);
                      setIsOpen(false);
                    }}
                    className={`py-1 rounded-lg text-[11px] font-bold transition ${
                      isSelected
                        ? activeBg
                        : 'bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* All 30-minute time slots */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
              Tất cả khung giờ (00:00 – 23:30)
            </span>
            <div className="grid grid-cols-4 gap-1 max-h-44 overflow-y-auto pr-0.5">
              {ALL_TIME_SLOTS.map((t) => {
                const isSelected = value === t;
                return (
                  <button
                    key={t}
                    ref={isSelected ? activeSlotRef : undefined}
                    type="button"
                    onClick={() => {
                      onChange(t);
                      setIsOpen(false);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-bold transition ${
                      isSelected
                        ? `${activeBg} shadow-2xs`
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
