import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface PopupSelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  group?: string;
  badge?: string;
  badgeColor?: string;
}

interface PopupSelectProps {
  value: string | number;
  onChange: (val: string) => void;
  options: PopupSelectOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownAlign?: 'left' | 'right';
  dropdownWidthClass?: string;
}

export const PopupSelect: React.FC<PopupSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Chọn...',
  searchable = false,
  searchPlaceholder = 'Tìm nhanh...',
  className = '',
  buttonClassName = '',
  dropdownAlign = 'left',
  dropdownWidthClass = 'w-full min-w-[220px]',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)) ||
        (o.group && o.group.toLowerCase().includes(q))
    );
  }, [options, query]);

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
      if (searchable) {
        setTimeout(() => searchInputRef.current?.focus(), 30);
      }
    } else {
      setQuery('');
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, searchable]);

  // Group options if any option has `group`
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, PopupSelectOption[]>();
    for (const opt of filteredOptions) {
      const gKey = opt.group || '';
      const list = groups.get(gKey) || [];
      list.push(opt);
      groups.set(gKey, list);
    }
    return Array.from(groups.entries());
  }, [filteredOptions]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={
          buttonClassName ||
          `w-full flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-2xs transition cursor-pointer select-none ${
            isOpen
              ? 'border-[#0068ff] ring-2 ring-blue-100'
              : 'border-slate-300 hover:border-blue-400'
          }`
        }
      >
        <span className="truncate text-left">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#0068ff]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 z-50 ${
            dropdownAlign === 'right' ? 'right-0' : 'left-0'
          } ${dropdownWidthClass} rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100`}
        >
          {searchable && (
            <div className="relative mb-1.5 px-0.5 pt-0.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#0068ff] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-4 px-2 text-center text-xs text-slate-400">
                Không tìm thấy kết quả phù hợp
              </div>
            ) : (
              groupedEntries.map(([groupName, groupOpts]) => (
                <div key={groupName || '__default'} className="space-y-0.5">
                  {groupName && (
                    <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {groupName}
                    </div>
                  )}
                  {groupOpts.map((opt) => {
                    const isSelected = String(opt.value) === String(value);
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => {
                          onChange(String(opt.value));
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#edf4ff] text-[#0068ff] font-extrabold'
                            : 'text-slate-800 hover:bg-slate-100 font-semibold'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{opt.label}</div>
                          {opt.sublabel && (
                            <div className="text-[10.5px] text-slate-500 font-normal truncate mt-0.2">
                              {opt.sublabel}
                            </div>
                          )}
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#0068ff] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
