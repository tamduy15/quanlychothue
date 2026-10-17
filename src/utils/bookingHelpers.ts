/**
 * Helper utilities for Booking date/time selection and short code generation
 */

export function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = (timeStr || '08:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function calculatePresetEnd(
  startDateStr: string,
  startTimeStr: string,
  presetHours: number
): { endDateStr: string; endTimeStr: string } {
  const start = combineDateAndTime(startDateStr, startTimeStr);
  const end = new Date(start.getTime() + presetHours * 3600 * 1000);
  const endHours = String(end.getHours()).padStart(2, '0');
  const endMinutes = String(end.getMinutes()).padStart(2, '0');
  return {
    endDateStr: toDateInputValue(end),
    endTimeStr: `${endHours}:${endMinutes}`,
  };
}

export function generateShortBookingCode(existingCodes: string[]): string {
  const set = new Set(existingCodes.map((c) => c.toUpperCase().trim()));
  let num = 1;
  while (num < 10000) {
    const candidate = `BK-${String(num).padStart(2, '0')}`;
    if (!set.has(candidate)) {
      return candidate;
    }
    num++;
  }
  return `BK-${Date.now().toString().slice(-4)}`;
}

export function generateShortEquipmentCode(existingCodes: string[]): string {
  const set = new Set(existingCodes.map((c) => c.toUpperCase().trim()));
  let num = 1;
  while (num < 1000) {
    const candidate = `M-${String(num).padStart(2, '0')}`;
    if (!set.has(candidate)) {
      return candidate;
    }
    num++;
  }
  return `M-${Date.now().toString().slice(-4)}`;
}

export const TIME_SLOTS: string[] = [
  '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30', '23:00',
];
