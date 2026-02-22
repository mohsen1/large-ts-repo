import { QuoteInput, quote } from '@domain/pricing';
import { calculateInvoice } from '@domain/billing';
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
  return calculateInvoice({
    ...order,
    subtotal: { currency: q.currency, amount: q.net },
    total: { currency: q.currency, amount: q.net },
    lines: [],
    id: order.id,
    purchaserId: order.purchaserId,
    tenantId: order.tenantId,
    createdAt: order.createdAt,
    state: order.state,
  }, { vatRate: 0.1, applyVat: true, rounding: 'round' }).then((result) => result.ok ? result.value.total.amount : order.total.amount);
};
