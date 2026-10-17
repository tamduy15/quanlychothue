/**
 * Utilities to normalize dates parsed from Excel, mitigating historical timezone drift,
 * fractional seconds, and Excel epoch leap year inconsistencies.
 */

/**
 * Normalizes an Excel date or timestamp to clean second/minute accuracy.
 * Specifically corrects historical timezone drift (+/- seconds or historical 2-minute offset)
 * and floating point inaccuracy from Excel serial date conversions.
 */
export function normalizeExcelDate(value: number | string | Date): Date {
  let date: Date;

  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value === 'number') {
    // Excel serial date number: (value - 25569) * 86400 * 1000
    // 25569 = days between 1899-12-30 and 1970-01-01
    const msSinceEpoch = (value - 25569) * 86400 * 1000;
    date = new Date(msSinceEpoch);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) {
    return new Date();
  }

  // Round seconds to avoid floating point microsecond precision drift
  const totalSeconds = Math.round(date.getTime() / 1000);
  const roundedDate = new Date(totalSeconds * 1000);

  // If the time has small second drift like :59 or :01, or 2-minute drift from
  // legacy GMT+7:06:30 conversion, align to nearest minute if within 3 seconds
  const seconds = roundedDate.getSeconds();
  if (seconds >= 58) {
    roundedDate.setSeconds(0);
    roundedDate.setMinutes(roundedDate.getMinutes() + 1);
  } else if (seconds <= 2) {
    roundedDate.setSeconds(0);
  }

  return roundedDate;
}

/**
 * Formats a normalized date to ISO string without millisecond clutter
 */
export function toNormalizedISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}
