import type { Paise } from './pricing.engine';

export interface DairyScheme {
  start: Date; monthly: Paise; durationMonths: 6 | 11 | 12;
  type: 'NORMAL' | 'BONUS';
  bonusInstallments?: number; // BONUS: installments gifted on completion (default 1)
}
export interface DairyPayment { date: Date; amount: Paise }

const IST_MS = 19_800_000;

/** Adds calendar months in IST; 31 Jan + 1 month = 28/29 Feb (never overflows into March). */
export const addMonths = (d: Date, n: number) => {
  const x = new Date(d.getTime() + IST_MS);
  const total = x.getUTCMonth() + n;
  const ty = x.getUTCFullYear() + Math.floor(total / 12), tm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(x.getUTCDate(), last), x.getUTCHours(), x.getUTCMinutes(),
    x.getUTCSeconds(), x.getUTCMilliseconds()) - IST_MS);
};

/** Installments due so far: the start month counts as due, +1 each calendar month (IST). */
const monthsElapsed = (start: Date, today: Date) => {
  const a = new Date(start.getTime() + IST_MS), b = new Date(today.getTime() + IST_MS);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
};

export function dairyStatusFromPaid(s: DairyScheme, paid: Paise, today = new Date()) {
  const paidMonths = Math.floor(paid / s.monthly);            // advance / multi-month supported
  const dueMonths = Math.min(Math.max(monthsElapsed(s.start, today), 0), s.durationMonths);
  const missed = Math.max(0, dueMonths - paidMonths);
  const maturityDate = addMonths(s.start, s.durationMonths);
  const complete = paidMonths >= s.durationMonths;
  const status = complete ? 'COMPLETED' : today >= maturityDate ? 'MATURED_SHORTFALL' : 'ACTIVE';
  const bonus = complete && s.type === 'BONUS' ? (s.bonusInstallments ?? 1) * s.monthly : 0;
  return { paid, paidMonths, dueMonths, missed, maturityDate, status, bonus, redeemable: paid + bonus };
}

export function dairyStatus(s: DairyScheme, payments: DairyPayment[], today = new Date()) {
  return dairyStatusFromPaid(s, payments.reduce((a, p) => a + p.amount, 0), today);
}

/** Ledger entry created when POS applies dairy to an invoice. */
export function applyToInvoice(balance: Paise, amount: Paise, invoiceId: string) {
  if (amount <= 0 || amount > balance) throw new Error('Invalid dairy adjustment');
  return { invoiceId, debit: amount, balanceAfter: balance - amount, at: new Date() };
}
