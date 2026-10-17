import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate24hTimelineSlots } from './timeline24h.ts';
import type { Booking } from '../types/index.ts';

test('calculate24hTimelineSlots computes exact percentage of 00:00 - 23:59', () => {
  const day = new Date(2026, 9, 17); // 17 Oct 2026

  const bookings: Booking[] = [
    {
      id: 1,
      booking_code: 'BK-TEST-1',
      customer_id: 1,
      status: 'active',
      start_at: '2026-10-17T06:00:00.000Z', // 6:00 UTC
      end_at: '2026-10-17T18:00:00.000Z',   // 18:00 UTC
      total_rent: 300000,
      deposit_holding_required: 0,
      deposit_holding_received: 0,
      deposit_holding_returned: 0,
      deposit_security_required: 500000,
      deposit_security_received: 500000,
      deposit_security_returned: 0,
      deposit_required: 500000,
      deposit_received: 500000,
      deposit_returned: 0,
      discount: 0,
      extra_fees: 0,
      created_at: '2026-10-15T00:00:00.000Z',
    },
  ];

  const slots = calculate24hTimelineSlots(bookings, day);
  assert.equal(slots.length, 1);
  const slot = slots[0];
  assert.equal(slot.startsOnThisDay, true);
  assert.equal(slot.endsOnThisDay, true);
  // Width should be approx 50% for a 12h rental (18 - 6 = 12h = 50% of 24h)
  assert.ok(slot.widthPercent >= 45 && slot.widthPercent <= 55);
});
