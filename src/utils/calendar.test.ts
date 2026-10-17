import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  differenceInCalendarDays,
  parseISO,
} from 'date-fns';

test('Monthly Calendar date-fns calculations partition weeks and days accurately', () => {
  const testDate = new Date(2026, 9, 15); // October 2026
  const mStart = startOfMonth(testDate);
  const mEnd = endOfMonth(testDate);

  const calStart = startOfWeek(mStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(mEnd, { weekStartsOn: 1 });

  const weeks = eachWeekOfInterval({ start: calStart, end: calEnd }, { weekStartsOn: 1 });

  // October 2026 starts on Thursday (1st) and ends on Saturday (31st) -> 5 weeks
  assert.ok(weeks.length >= 5 && weeks.length <= 6);

  // Test booking span calculation: Oct 14 09:00 to Oct 17 18:00
  const bStart = parseISO('2026-10-14T09:00:00');
  const bEnd = parseISO('2026-10-17T18:00:00');

  // Find week containing Oct 14
  const targetWeek = weeks.find((w) => {
    const wEnd = endOfWeek(w, { weekStartsOn: 1 });
    return bStart >= w && bStart <= wEnd;
  });

  assert.ok(targetWeek, 'Target week should be found');
  const startCol = differenceInCalendarDays(bStart, targetWeek) + 1;
  const endCol = differenceInCalendarDays(bEnd, targetWeek) + 1;
  const span = endCol - startCol + 1;

  // 14th is Wednesday (col 3), 17th is Saturday (col 6) -> span = 4
  assert.equal(startCol, 3);
  assert.equal(endCol, 6);
  assert.equal(span, 4);
});
