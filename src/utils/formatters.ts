import { format, parseISO } from 'date-fns';

export const STORE_OWNER = {
  name: 'Châu Nguyễn Phương Thanh',
  phone: '0353507296',
  address: 'TP. Hồ Chí Minh',
};

export function formatVND(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formats ISO string or Date to Vietnamese dd/MM/yyyy. HH:mm (24-hour format)
 */
export function formatDateTimeVN(isoString: string | Date | undefined | null): string {
  if (!isoString) return '--';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : isoString;
    if (isNaN(d.getTime())) return String(isoString);
    return format(d, 'dd/MM/yyyy. HH:mm');
  } catch {
    return String(isoString);
  }
}

/**
 * Formats ISO string or Date to Vietnamese dd/MM/yyyy
 */
export function formatDateVN(isoString: string | Date | undefined | null): string {
  if (!isoString) return '--';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : isoString;
    if (isNaN(d.getTime())) return String(isoString);
    return format(d, 'dd/MM/yyyy');
  } catch {
    return String(isoString);
  }
}

/**
 * Formats ISO string or Date to 24-hour time HH:mm
 */
export function formatTimeVN(isoString: string | Date | undefined | null): string {
  if (!isoString) return '--';
  try {
    const d = typeof isoString === 'string' ? parseISO(isoString) : isoString;
    if (isNaN(d.getTime())) return String(isoString);
    return format(d, 'HH:mm');
  } catch {
    return String(isoString);
  }
}

/**
 * Parses user input date string in dd/MM/yyyy or dd/MM/yyyy. HH:mm format
 */
export function parseVNDateTime(str: string): Date | null {
  if (!str) return null;
  // Match dd/MM/yyyy. HH:mm or dd/MM/yyyy HH:mm or dd/MM/yyyy HH:mm:ss
  const matchWithTime = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[.\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (matchWithTime) {
    const day = parseInt(matchWithTime[1], 10);
    const month = parseInt(matchWithTime[2], 10) - 1;
    const year = parseInt(matchWithTime[3], 10);
    const hour = parseInt(matchWithTime[4], 10);
    const minute = parseInt(matchWithTime[5], 10);
    const second = matchWithTime[6] ? parseInt(matchWithTime[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  // Match dd/MM/yyyy only
  const matchDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (matchDate) {
    const day = parseInt(matchDate[1], 10);
    const month = parseInt(matchDate[2], 10) - 1;
    const year = parseInt(matchDate[3], 10);
    return new Date(year, month, day, 0, 0, 0);
  }

  // Fallback to ISO
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export const EQUIPMENT_STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string }> = {
  available: {
    label: 'Sẵn sàng',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  rented: {
    label: 'Đang cho thuê',
    bg: 'bg-amber-50 text-amber-700 border-amber-200',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  maintenance: {
    label: 'Bảo dưỡng / Sửa',
    bg: 'bg-rose-50 text-rose-700 border-rose-200',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  retired: {
    label: 'Ngừng khai thác',
    bg: 'bg-slate-100 text-slate-600 border-slate-200',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

export const BOOKING_STATUS_MAP: Record<string, { label: string; bg: string; text: string; border: string; barBg: string }> = {
  draft: {
    label: 'Bản nháp',
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    text: 'text-slate-700',
    border: 'border-slate-200',
    barBg: 'bg-slate-400 text-white',
  },
  confirmed: {
    label: 'Đã chốt lịch',
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    text: 'text-blue-700',
    border: 'border-blue-200',
    barBg: 'bg-blue-500 text-white shadow-sm',
  },
  active: {
    label: 'Đang thuê máy',
    bg: 'bg-amber-50 text-amber-700 border-amber-200',
    text: 'text-amber-700',
    border: 'border-amber-200',
    barBg: 'bg-amber-500 text-white shadow-sm',
  },
  returned: {
    label: 'Đã hoàn thành',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    barBg: 'bg-emerald-500 text-white shadow-sm',
  },
  cancelled: {
    label: 'Đã hủy',
    bg: 'bg-rose-50 text-rose-700 border-rose-200',
    text: 'text-rose-700',
    border: 'border-rose-200',
    barBg: 'bg-rose-400 text-white',
  },
};

export const TRUST_LEVEL_MAP: Record<string, { label: string; bg: string; text: string }> = {
  vip: {
    label: 'VIP Uy tín',
    bg: 'bg-amber-100 text-amber-800 border-amber-300',
    text: 'text-amber-800',
  },
  verified: {
    label: 'Đã xác minh',
    bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    text: 'text-emerald-800',
  },
  normal: {
    label: 'Khách thường',
    bg: 'bg-sky-100 text-sky-800 border-sky-300',
    text: 'text-sky-800',
  },
  blacklisted: {
    label: 'Cảnh báo rủi ro',
    bg: 'bg-rose-100 text-rose-800 border-rose-300',
    text: 'text-rose-800',
  },
};
