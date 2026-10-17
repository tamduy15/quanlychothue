import React, { useState, useEffect, useRef } from 'react';
import {
  format,
  parse,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addDays,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface DatePickerVNProps {
  value: string; // YYYY-MM-DD
  onChange: (dateIsoDateStr: string) => void; // returns YYYY-MM-DD
  placeholder?: string;
  accentColor?: 'cyan' | 'amber' | 'blue' | 'emerald';
  minDate?: string;
  className?: string;
  showQuickPills?: boolean;
}

// Convert YYYY-MM-DD to DD/MM/YYYY
function isoToVNDate(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Convert DD/MM/YYYY to YYYY-MM-DD if valid
function vnDateToIso(vn: string): string | null {
  if (!vn) return null;
  const parts = vn.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;

  const parsed = parse(`${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`, 'dd/MM/yyyy', new Date());
  if (isValid(parsed) && parsed.getDate() === d && parsed.getMonth() + 1 === m) {
    return format(parsed, 'yyyy-MM-dd');
  }
  return null;
}

export const DatePickerVN: React.FC<DatePickerVNProps> = ({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  accentColor = 'cyan',
  minDate,
  className = '',
  showQuickPills = true,
}) => {
  const [textInput, setTextInput] = useState<string>(() => isoToVNDate(value));
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Month shown in the popup calendar
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const p = parse(value, 'yyyy-MM-dd', new Date());
      if (isValid(p)) return p;
    }
    return new Date();
  });

  // Sync internal text when external value changes
  useEffect(() => {
    const formatted = isoToVNDate(value);
    setTextInput(formatted);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const p = parse(value, 'yyyy-MM-dd', new Date());
      if (isValid(p)) {
        setViewDate(p);
      }
    }
  }, [value]);

  // Click outside to close calendar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle typing in text input with smart auto-formatting
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    
    // Only allow digits and /
    raw = raw.replace(/[^\d/]/g, '');

    // Auto-insert slash after 2 digits and 4 digits if user types continuously
    if (raw.length === 2 && !raw.includes('/') && !textInput.endsWith('/')) {
      raw = raw + '/';
    } else if (raw.length === 5 && raw.split('/').length === 2 && !textInput.endsWith('/')) {
      raw = raw + '/';
    }

    // Limit to max 10 chars (dd/mm/yyyy)
    if (raw.length > 10) {
      raw = raw.slice(0, 10);
    }

    setTextInput(raw);

    // If matches complete dd/mm/yyyy, parse and trigger onChange
    if (raw.length === 10) {
      const iso = vnDateToIso(raw);
      if (iso) {
        onChange(iso);
        const p = parse(iso, 'yyyy-MM-dd', new Date());
        if (isValid(p)) setViewDate(p);
      }
    }
  };

  const handleBlur = () => {
    if (!textInput.trim()) {
      return;
    }
    const iso = vnDateToIso(textInput);
    if (iso) {
      onChange(iso);
      setTextInput(isoToVNDate(iso));
    } else {
      // Revert to valid value if typed gibberish
      setTextInput(isoToVNDate(value));
    }
  };

  const handleSelectDay = (day: Date) => {
    const iso = format(day, 'yyyy-MM-dd');
    onChange(iso);
    setTextInput(format(day, 'dd/MM/yyyy'));
    setIsOpen(false);
  };

  const handleQuickPreset = (offsetDays: number) => {
    const d = addDays(new Date(), offsetDays);
    const iso = format(d, 'yyyy-MM-dd');
    onChange(iso);
    setTextInput(format(d, 'dd/MM/yyyy'));
    setViewDate(d);
    setIsOpen(false);
  };

  // Calendar calculations
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const activeDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : null;

  const accentClasses = {
    cyan: {
      border: 'focus-within:border-cyan-500',
      activeDay: 'bg-cyan-600 text-white font-bold shadow-xs',
      button: 'text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border-cyan-200',
      badge: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    },
    amber: {
      border: 'focus-within:border-amber-500',
      activeDay: 'bg-amber-600 text-white font-bold shadow-xs',
      button: 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200',
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    blue: {
      border: 'focus-within:border-blue-500',
      activeDay: 'bg-blue-600 text-white font-bold shadow-xs',
      button: 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200',
      badge: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    emerald: {
      border: 'focus-within:border-emerald-500',
      activeDay: 'bg-emerald-600 text-white font-bold shadow-xs',
      button: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
  }[accentColor];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Input container */}
      <div
        className={`flex items-center rounded-xl border border-slate-300 bg-slate-50/50 shadow-xs transition ${accentClasses.border} focus-within:bg-white`}
      >
        <input
          type="text"
          value={textInput}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          maxLength={10}
          className="w-full bg-transparent px-2.5 py-1.5 text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none"
        />

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Mở lịch chọn ngày"
          className="p-1.5 mr-1 rounded-lg text-slate-500 hover:text-cyan-700 hover:bg-slate-100 transition active:scale-95"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Popover Calendar Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100">
          {/* Calendar Header with Navigation */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setViewDate((prev) => subMonths(prev, 1))}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 active:scale-90 transition"
              title="Tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-black text-slate-800 capitalize">
              Tháng {format(viewDate, 'MM / yyyy')}
            </span>

            <button
              type="button"
              onClick={() => setViewDate((prev) => addMonths(prev, 1))}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 active:scale-90 transition"
              title="Tháng sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Select Buttons */}
          {showQuickPills && (
            <div className="grid grid-cols-4 gap-1 mb-2.5 pb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => handleQuickPreset(0)}
                className="py-1 px-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(1)}
                className="py-1 px-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                Ngày mai
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(2)}
                className="py-1 px-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                +2 ngày
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(3)}
                className="py-1 px-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                +3 ngày
              </button>
            </div>
          )}

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
              <div key={d} className="py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isSelected = activeDate && isValid(activeDate) && isSameDay(day, activeDate);
              const isCurrentMonth = day.getMonth() === viewDate.getMonth();
              const isCurrentDay = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 w-7 mx-auto rounded-lg text-xs font-semibold flex items-center justify-center transition active:scale-95 ${
                    isSelected
                      ? accentClasses.activeDay
                      : isCurrentDay
                      ? 'border border-cyan-500 font-bold text-cyan-700 bg-cyan-50/50 hover:bg-cyan-100'
                      : isCurrentMonth
                      ? 'text-slate-800 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span>Định dạng chuẩn:</span>
            <span className="font-bold text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200">
              dd/mm/yyyy
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
