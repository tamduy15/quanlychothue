import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExcelDate, toNormalizedISOString } from './excelDrift.ts';

test('normalizeExcelDate eliminates fractional second drift and rounds reliably', () => {
  // Test with a date that has 59 seconds drift
  const driftDate1 = new Date('2026-10-17T08:59:59.850Z');
  const normalized1 = normalizeExcelDate(driftDate1);
  assert.equal(normalized1.getSeconds(), 0);

  // Test with Excel serial date number
  // 46312 is around Oct 2026
  const excelSerial = 46312.333333333; // 8:00 AM
  const normalized2 = normalizeExcelDate(excelSerial);
  assert.equal(typeof normalized2.getTime(), 'number');
  assert.equal(isNaN(normalized2.getTime()), false);

  const iso = toNormalizedISOString(new Date(2026, 9, 17, 8, 30, 0));
  assert.equal(iso, '2026-10-17T08:30:00');
});
