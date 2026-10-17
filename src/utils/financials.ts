import type { Transaction } from '../types/index.ts';

export interface FinancialSummary {
  totalRevenue: number;         // Doanh thu thực tế (tiền thuê, dịch vụ, phụ phí...)
  totalOperatingExpense: number;// Chi phí vận hành, bảo dưỡng, vật tư
  netProfit: number;            // Lợi nhuận thuần = totalRevenue - totalOperatingExpense
  currentDepositHeld: number;   // Tổng tiền cọc đang giữ của khách (Cọc giữ lịch + Cọc thế chân)
  realCashBalance: number;      // Tiền mặt / tài khoản thực tế = Doanh thu thuần + Cọc đang giữ
  holdingDepositHeld: number;   // Tiền cọc giữ lịch đang tạm giữ
  securityDepositHeld: number;  // Tiền cọc thế chân đang tạm giữ
}

/**
 * Calculates financial metrics strictly keeping customer security deposits & holding deposits
 * isolated from rental revenue and operational expenses.
 */
export function calculateFinancialSummary(transactions: Transaction[]): FinancialSummary {
  let totalRevenue = 0;
  let totalOperatingExpense = 0;
  let holdingIn = 0;
  let holdingOut = 0;
  let securityIn = 0;
  let securityOut = 0;
  let genericDepositIn = 0;
  let genericDepositOut = 0;

  for (const tx of transactions) {
    if (tx.is_deposit) {
      if (tx.type === 'deposit_holding_in') {
        holdingIn += tx.amount;
      } else if (tx.type === 'deposit_holding_refund') {
        holdingOut += tx.amount;
      } else if (tx.type === 'deposit_security_in') {
        securityIn += tx.amount;
      } else if (tx.type === 'deposit_security_refund') {
        securityOut += tx.amount;
      } else if (tx.type === 'deposit_in') {
        genericDepositIn += tx.amount;
      } else if (tx.type === 'deposit_refund') {
        genericDepositOut += tx.amount;
      }
    } else {
      if (tx.type === 'income_rent' || tx.type === 'other_income') {
        totalRevenue += tx.amount;
      } else if (tx.type === 'expense') {
        totalOperatingExpense += tx.amount;
      }
    }
  }

  const holdingDepositHeld = Math.max(0, holdingIn - holdingOut);
  const securityDepositHeld = Math.max(0, (securityIn + genericDepositIn) - (securityOut + genericDepositOut));
  const currentDepositHeld = holdingDepositHeld + securityDepositHeld;

  const netProfit = totalRevenue - totalOperatingExpense;
  const realCashBalance = netProfit + currentDepositHeld;

  return {
    totalRevenue,
    totalOperatingExpense,
    netProfit,
    currentDepositHeld,
    realCashBalance,
    holdingDepositHeld,
    securityDepositHeld,
  };
}
