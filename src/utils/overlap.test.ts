import test from 'node:test';
import assert from 'node:assert/strict';
import { isTimeRangeOverlapping, findConflictingEquipment } from './overlap.ts';

test('isTimeRangeOverlapping identifies overlapping intervals correctly', () => {
  // Case 1: Overlapping intervals
  const r1 = isTimeRangeOverlapping(
    '2026-10-17T09:00:00',
    '2026-10-18T18:00:00',
    '2026-10-17T12:00:00',
    '2026-10-17T17:00:00'
  );
  assert.equal(r1, true);

  // Case 2: Adjacent intervals (one ends exactly when next starts) -> not overlapping
  const r2 = isTimeRangeOverlapping(
    '2026-10-17T09:00:00',
    '2026-10-17T12:00:00',
    '2026-10-17T12:00:00',
    '2026-10-17T18:00:00'
  );
  assert.equal(r2, false);

  // Case 3: Completely disjoint
  const r3 = isTimeRangeOverlapping(
    '2026-10-17T09:00:00',
    '2026-10-17T12:00:00',
    '2026-10-18T09:00:00',
    '2026-10-18T12:00:00'
  );
  assert.equal(r3, false);
});

test('findConflictingEquipment prevents overlapping equipment in confirmed or active state', () => {
  const existingBookings = [
    {
      bookingId: 101,
      status: 'confirmed' as const,
      start_at: '2026-10-17T08:00:00',
      end_at: '2026-10-18T12:00:00',
      equipmentIds: [1, 2],
    },
    {
      bookingId: 102,
      status: 'cancelled' as const,
      start_at: '2026-10-17T08:00:00',
      end_at: '2026-10-18T12:00:00',
      equipmentIds: [3],
    },
    {
      bookingId: 103,
      status: 'active' as const,
      start_at: '2026-10-18T10:00:00',
      end_at: '2026-10-19T10:00:00',
      equipmentIds: [4],
    },
  ];

  // Try to rent equipment 1 during booking 101's window
  const conflicts1 = findConflictingEquipment(
    '2026-10-17T10:00:00',
    '2026-10-17T16:00:00',
    [1, 5],
    existingBookings
  );
  assert.equal(conflicts1.length, 1);
  assert.equal(conflicts1[0].equipmentId, 1);
  assert.equal(conflicts1[0].conflictingBookingId, 101);

  // Cancelled booking 102 does NOT conflict with equipment 3
  const conflicts2 = findConflictingEquipment(
    '2026-10-17T09:00:00',
    '2026-10-17T11:00:00',
    [3],
    existingBookings
  );
  assert.equal(conflicts2.length, 0);

  // Excluding current bookingId during an edit does not conflict with itself
  const conflicts3 = findConflictingEquipment(
    '2026-10-17T08:00:00',
    '2026-10-18T12:00:00',
    [1, 2],
    existingBookings,
    101 // exclude booking 101
  );
  assert.equal(conflicts3.length, 0);
});
