import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TrendingUp,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Trash2,
  Lock,
} from 'lucide-react';
import { db } from '../../db/db.ts';
import { GlassCard } from '../common/GlassCard.tsx';
import { GlassModal } from '../common/GlassModal.tsx';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal.tsx';
import { calculateFinancialSummary } from '../../utils/financials.ts';
import { formatVND, formatDateTimeVN } from '../../utils/formatters.ts';
import type { Transaction, TransactionType, PaymentMethod } from '../../types/index.ts';

export const FinanceView: React.FC = () => {
  const transactions = useLiveQuery(() => db.transactions.reverse().toArray()) || [];
  const bookings = useLiveQuery(() => db.bookings.toArray()) || [];

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);

  // Form State
  const [type, setType] = useState<TransactionType>('income_rent');
  const [amount, setAmount] = useState<number>(150000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [note, setNote] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (
      newType === 'deposit_holding_in' ||
      newType === 'deposit_holding_refund' ||
      newType === 'deposit_security_in' ||
      newType === 'deposit_security_refund' ||
      newType === 'deposit_in' ||
      newType === 'deposit_refund'
    ) {
      setIsDeposit(true);
    } else {
      setIsDeposit(false);
    }
  };

  const bookingMap = React.useMemo(() => {
    return new Map(bookings.map((b) => [b.id, b]));
  }, [bookings]);

  const financials = calculateFinancialSummary(transactions);

  const filteredTransactions = transactions.filter((tx) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'revenue') return tx.type === 'income_rent' || tx.type === 'other_income';
    if (typeFilter === 'deposit') return tx.is_deposit;
    if (typeFilter === 'expense') return tx.type === 'expense';
    return true;
  });

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    await db.transactions.add({
      type,
      amount: Number(amount),
      payment_method: paymentMethod,
      date: new Date().toISOString(),
      note: note.trim() || 'Giao dịch thu chi',
      is_deposit: isDeposit,
    });

    setModalOpen(false);
    setAmount(150000);
    setNote('');
  };

  const handleDelete = (tx: Transaction) => {
    if (!tx.id) return;
    setDeletingTransaction(tx);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTransaction?.id) return;
    await db.transactions.delete(deletingTransaction.id);
    setDeletingTransaction(null);
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            <span>Sổ Quỹ & Dòng Tiền Thuê Máy</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Minh bạch dòng tiền: Phân biệt rõ Tiền cọc thế chân, Cọc giữ lịch và Doanh thu thực nhận.
          </p>
        </div>

        <button
          onClick={() => {
            handleTypeChange('income_rent');
            setModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          <span>+ Ghi chép Thu / Chi</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Doanh thu */}
        <GlassCard>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Doanh thu Thuê máy
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-700">
            {formatVND(financials.totalRevenue)}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Tiền cho thuê & phụ phí thu về</p>
        </GlassCard>

        {/* Chi phí */}
        <GlassCard>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Chi phí Vận hành
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-black text-rose-700">
            {formatVND(financials.totalOperatingExpense)}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Vệ sinh máy, phụ kiện pin sạc</p>
        </GlassCard>

        {/* Lợi nhuận ròng */}
        <GlassCard>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Lợi Nhuận Thuần
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-black text-cyan-700">
            {formatVND(financials.netProfit)}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Doanh thu - Chi phí vận hành</p>
        </GlassCard>

        {/* Cọc đang giữ */}
        <GlassCard variant="glow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">
              Cọc Đang Giữ (Khách)
            </span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-indigo-700">
            {formatVND(financials.currentDepositHeld)}
          </div>
          <div className="mt-1 text-[10px] text-indigo-900/80 font-medium">
            Thế chân: {formatVND(financials.securityDepositHeld)} • Giữ lịch: {formatVND(financials.holdingDepositHeld)}
          </div>
        </GlassCard>
      </div>

      {/* Filter and Cashbook List */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900 text-sm">
            Nhật ký Giao dịch Sổ quỹ ({filteredTransactions.length} bút toán)
          </h2>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setTypeFilter('all')}
              className={`rounded-lg px-2.5 py-1 font-bold transition ${
                typeFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setTypeFilter('revenue')}
              className={`rounded-lg px-2.5 py-1 font-bold transition ${
                typeFilter === 'revenue'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Doanh thu thuê
            </button>
            <button
              onClick={() => setTypeFilter('deposit')}
              className={`rounded-lg px-2.5 py-1 font-bold transition ${
                typeFilter === 'deposit'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tiền cọc
            </button>
            <button
              onClick={() => setTypeFilter('expense')}
              className={`rounded-lg px-2.5 py-1 font-bold transition ${
                typeFilter === 'expense'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Chi phí
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="p-3 divide-y divide-slate-100">
          {filteredTransactions.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Chưa có giao dịch nào phù hợp.
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const isIncome =
                tx.type === 'income_rent' ||
                tx.type === 'other_income' ||
                tx.type === 'deposit_in' ||
                tx.type === 'deposit_holding_in' ||
                tx.type === 'deposit_security_in';

              const relatedBooking = tx.booking_id ? bookingMap.get(tx.booking_id) : undefined;

              return (
                <div
                  key={tx.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-2 rounded-xl hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                        tx.is_deposit
                          ? 'bg-indigo-100 text-indigo-700'
                          : tx.type === 'expense'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {tx.is_deposit ? (
                        <Lock className="w-4 h-4" />
                      ) : tx.type === 'expense' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-slate-900 text-xs">{tx.note}</strong>
                        {tx.is_deposit && (
                          <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 text-[10px] font-bold text-indigo-800">
                            TIỀN CỌC
                          </span>
                        )}
                        {relatedBooking && (
                          <span className="font-mono text-[10px] text-cyan-800 font-bold">
                            [{relatedBooking.booking_code}]
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{formatDateTimeVN(tx.date)}</span>
                        <span>•</span>
                        <span className="uppercase font-semibold">{tx.payment_method}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0">
                    <span
                      className={`text-sm font-black ${
                        tx.type === 'expense' ||
                        tx.type === 'deposit_refund' ||
                        tx.type === 'deposit_holding_refund' ||
                        tx.type === 'deposit_security_refund'
                          ? 'text-rose-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {tx.type === 'expense' ||
                      tx.type === 'deposit_refund' ||
                      tx.type === 'deposit_holding_refund' ||
                      tx.type === 'deposit_security_refund'
                        ? '-'
                        : '+'}
                      {formatVND(tx.amount)}
                    </span>

                    <button
                      onClick={() => handleDelete(tx)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
                      title="Xóa bút toán"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </GlassCard>

      {/* Add Transaction Modal */}
      <GlassModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Ghi chép Giao dịch Thu / Chi"
        subtitle="Hạch toán dòng tiền vào IndexedDB"
        maxWidth="md"
      >
        <form onSubmit={handleAddTransaction} className="space-y-4 text-xs text-slate-800">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Loại nghiệp vụ</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none shadow-xs"
            >
              <option value="income_rent">1. Thu tiền thuê máy (+ Doanh thu)</option>
              <option value="deposit_holding_in">2. Thu tiền cọc giữ lịch (+ Cọc đang giữ)</option>
              <option value="deposit_holding_refund">3. Hoàn/Cấn trừ cọc giữ lịch (- Cọc đang giữ)</option>
              <option value="deposit_security_in">4. Thu tiền cọc thế chân máy (+ Cọc đang giữ)</option>
              <option value="deposit_security_refund">5. Hoàn tiền cọc thế chân (- Cọc đang giữ)</option>
              <option value="expense">6. Chi phí vận hành, bảo dưỡng (- Chi phí)</option>
              <option value="other_income">7. Thu khác (+ Doanh thu)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Số tiền (VND) <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="number"
              min="1000"
              step="10000"
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-900 focus:border-cyan-500 focus:outline-none shadow-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Phương thức thanh toán</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none shadow-xs"
            >
              <option value="transfer">Chuyển khoản ngân hàng (Transfer)</option>
              <option value="cash">Tiền mặt (Cash)</option>
              <option value="card">Thẻ / POS</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nội dung ghi chú</label>
            <input
              type="text"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Mua pin, cọc máy..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 font-bold text-white shadow-xs hover:brightness-105 active:scale-95"
            >
              Lưu giao dịch
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingTransaction}
        onClose={() => setDeletingTransaction(null)}
        onConfirm={handleConfirmDelete}
        title="Xác nhận xóa bút toán sổ quỹ"
        itemName={deletingTransaction ? `${formatVND(deletingTransaction.amount)} - ${deletingTransaction.note}` : ''}
        itemType="bút toán"
        description="Bạn có chắc chắn muốn xóa giao dịch này khỏi sổ quỹ? Số dư quỹ và doanh thu tương ứng sẽ được tự động tính toán lại."
        confirmButtonText="Xác nhận xóa bút toán"
      />
    </div>
  );
};
