import { parseISO } from 'date-fns';
import type { Booking } from '../types/index.ts';

export interface DayTimelineSlot {
  booking: Booking;
  startPercent: number; // 0 - 100% of the 24h day
  endPercent: number;   // 0 - 100% of the 24h day
  widthPercent: number; // width in %
  startsOnThisDay: boolean;
  endsOnThisDay: boolean;
  startTimeStr: string; // e.g. "08:00"
  endTimeStr: string;   // e.g. "18:00"
  returnHour: number;   // 0 - 24
  returnMinute: number; // 0 - 59
}

/**
 * Calculates the exact 24-hour ratio (00:00 - 23:59) for a booking on a specific date.
 * Allows visual representation of when the machine is picked up and returned.
 */
export function calculate24hTimelineSlots(bookings: Booking[], day: Date): DayTimelineSlot[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

  const slots: DayTimelineSlot[] = [];

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;

    const bStart = parseISO(b.start_at);
    const bEnd = parseISO(b.end_at);

    if (bStart > dayEnd || bEnd < dayStart) {
      continue;
    }

    const startsOnThisDay =
      bStart.getFullYear() === day.getFullYear() &&
      bStart.getMonth() === day.getMonth() &&
      bStart.getDate() === day.getDate();

    const endsOnThisDay =
      bEnd.getFullYear() === day.getFullYear() &&
      bEnd.getMonth() === day.getMonth() &&
      bEnd.getDate() === day.getDate();

    const startHour = startsOnThisDay ? bStart.getHours() + bStart.getMinutes() / 60 : 0;
    const endHour = endsOnThisDay ? bEnd.getHours() + bEnd.getMinutes() / 60 : 24;

    const startPercent = Math.max(0, Math.min(100, (startHour / 24) * 100));
    const endPercent = Math.max(0, Math.min(100, (endHour / 24) * 100));
    const widthPercent = Math.max(2, endPercent - startPercent);

    const startTimeStr = `${String(bStart.getHours()).padStart(2, '0')}:${String(bStart.getMinutes()).padStart(2, '0')}`;
    const endTimeStr = `${String(bEnd.getHours()).padStart(2, '0')}:${String(bEnd.getMinutes()).padStart(2, '0')}`;

    slots.push({
      booking: b,
      startPercent,
      endPercent,
      widthPercent,
      startsOnThisDay,
      endsOnThisDay,
      startTimeStr,
      endTimeStr,
      returnHour: bEnd.getHours(),
      returnMinute: bEnd.getMinutes(),
    });
  }

  return slots;
}
