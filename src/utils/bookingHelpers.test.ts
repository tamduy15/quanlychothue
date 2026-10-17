import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateInputValue,
  combineDateAndTime,
  calculatePresetEnd,
  generateShortBookingCode,
  generateShortEquipmentCode,
} from './bookingHelpers.ts';

test('toDateInputValue formats date to YYYY-MM-DD', () => {
  const d = new Date(2026, 9, 17); // 17 Oct 2026
  assert.equal(toDateInputValue(d), '2026-10-17');
});

test('combineDateAndTime combines date and time accurately', () => {
  const d = combineDateAndTime('2026-10-17', '14:30');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 17);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
});

test('calculatePresetEnd calculates accurate 6h, 24h, 48h endpoints', () => {
  const res6h = calculatePresetEnd('2026-10-17', '08:00', 6);
  assert.equal(res6h.endDateStr, '2026-10-17');
  assert.equal(res6h.endTimeStr, '14:00');

  const res24h = calculatePresetEnd('2026-10-17', '08:00', 24);
  assert.equal(res24h.endDateStr, '2026-10-18');
  assert.equal(res24h.endTimeStr, '08:00');
});

test('generateShortBookingCode generates short sequential codes BK-01, BK-02', () => {
  const code1 = generateShortBookingCode([]);
  assert.equal(code1, 'BK-01');

  const code2 = generateShortBookingCode(['BK-01', 'BK-02']);
  assert.equal(code2, 'BK-03');
});

test('generateShortEquipmentCode generates short codes M-01, M-02', () => {
  const code1 = generateShortEquipmentCode([]);
  assert.equal(code1, 'M-01');

  const code2 = generateShortEquipmentCode(['M-01', 'M-02']);
  assert.equal(code2, 'M-03');
});
