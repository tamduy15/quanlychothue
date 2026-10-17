import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinancialSummary } from './financials.ts';
import type { Transaction } from '../types/index.ts';

test('calculateFinancialSummary isolates holding deposits and security deposits from revenue', () => {
  const transactions: Transaction[] = [
    {
      type: 'income_rent',
      amount: 150000,
      payment_method: 'transfer',
      date: '2026-10-15T10:00:00',
      note: 'Thuê máy Canon R50',
      is_deposit: false,
    },
    {
      type: 'deposit_holding_in',
      amount: 50000,
      payment_method: 'transfer',
      date: '2026-10-14T08:00:00',
      note: 'Cọc giữ lịch Canon R50',
      is_deposit: true,
    },
    {
      type: 'deposit_security_in',
      amount: 500000,
      payment_method: 'transfer',
      date: '2026-10-15T10:00:00',
      note: 'Cọc thế chân Canon R50',
      is_deposit: true,
    },
    {
      type: 'expense',
      amount: 30000,
      payment_method: 'cash',
      date: '2026-10-15T14:00:00',
      note: 'Mua pin',
      is_deposit: false,
    },
    {
      type: 'deposit_holding_refund',
      amount: 50000,
      payment_method: 'transfer',
      date: '2026-10-15T10:05:00',
      note: 'Cấn trừ / hoàn cọc giữ lịch khi đã nhận máy',
      is_deposit: true,
    },
  ];

  const summary = calculateFinancialSummary(transactions);

  // Revenue is 150k
  assert.equal(summary.totalRevenue, 150000);
  // Operating expense is 30k
  assert.equal(summary.totalOperatingExpense, 30000);
  // Net profit is 120k
  assert.equal(summary.netProfit, 120000);
  // Holding deposit is 0 (50k in - 50k refund)
  assert.equal(summary.holdingDepositHeld, 0);
  // Security deposit is 500k
  assert.equal(summary.securityDepositHeld, 500000);
  // Total deposit held is 500k
  assert.equal(summary.currentDepositHeld, 500000);
  // Real cash balance is 120k + 500k = 620k
  assert.equal(summary.realCashBalance, 620000);
});
