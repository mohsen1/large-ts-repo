import { QuoteInput, quote } from '@domain/pricing';
import { calculateInvoice, Money, type Invoice, type InvoiceId } from '@domain/billing';
import { Order } from '@domain/orders';

export interface BillingPlan {
  rule: any;
}

export const planForOrder = (order: Order): QuoteInput => ({
  amount: order.total.amount,
  rules: [],
  discounts: [],
});

export const settle = async (order: Order, rule: any): Promise<number> => {
  const q = quote(rule, 1, []);
  const currency = (['USD', 'EUR', 'GBP'] as const).includes(q.currency as Money['currency']) ? (q.currency as Money['currency']) : 'USD';
    const invoice = calculateInvoice({
      id: order.id as unknown as InvoiceId,
      accountId: order.tenantId as unknown as Invoice['accountId'],
      lines: [],
      subtotal: { currency, amount: q.net },
      total: { currency, amount: q.net },
      settled: false,
    }, { vatRate: 0.1, applyVat: true, roundingDigits: 2 });
  return invoice.total.amount;
};
