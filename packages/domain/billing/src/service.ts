import { Money, Invoice, InvoiceLine, createMoney, sumMoney } from './types';
import { fail, ok } from '@shared/result';

export interface BillingPolicy {
  vatRate: number;
  applyVat: boolean;
  roundingDigits: number;
}

const toFixed = (value: number, digits: number): number => {
  return Number(value.toFixed(digits));
};

const multiply = (value: Money, factor: number, digits: number): Money => ({
  currency: value.currency,
  amount: toFixed(value.amount * factor, digits),
});

export const calculateLineTotal = (line: InvoiceLine, policy: BillingPolicy): Money => {
  const subtotal = multiply(line.unitPrice, line.quantity, policy.roundingDigits);
  if (!policy.applyVat) return subtotal;
  const vat = subtotal.amount * policy.vatRate;
  return { ...subtotal, amount: subtotal.amount + toFixed(vat, policy.roundingDigits) };
};

export const calculateInvoice = (invoice: Invoice, policy: BillingPolicy): Omit<Invoice, 'settled'> => {
  const totals = invoice.lines.map((line) => calculateLineTotal(line, policy));
  const total = totals.reduce((acc, current) => sumMoney(acc, current), createMoney(0, totals[0]?.currency ?? 'USD'));
  const subtotal = { ...total, amount: toFixed(total.amount - (policy.applyVat ? 0 : 0), policy.roundingDigits) };
  return { ...invoice, subtotal, total };
};

export const settleInvoice = async (invoice: Invoice, policy: BillingPolicy) => {
  try {
    return ok(calculateInvoice(invoice, policy));
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('unknown')); 
  }
};
