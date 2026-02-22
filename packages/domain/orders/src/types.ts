import { Brand } from '@shared/core';
import { Money } from '@domain/billing';

export type OrderId = Brand<string, 'OrderId'>;
export type ShipmentId = Brand<string, 'ShipmentId'>;
export type PurchaseId = Brand<string, 'PurchaseId'>;

export type OrderState = 'draft' | 'submitted' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: Money;
  discount?: number;
  metadata?: Record<string, unknown>;
}

export interface Order {
  id: OrderId;
  purchaserId: Brand<string, 'UserId'>;
  tenantId: Brand<string, 'TenantId'>;
  lines: OrderLine[];
  createdAt: string;
  state: OrderState;
  subtotal: Money;
  total: Money;
  shipmentId?: ShipmentId;
  purchaseId?: PurchaseId;
}

export interface OrderSearch {
  tenantId?: Brand<string, 'TenantId'>;
  state?: OrderState;
  start?: string;
  end?: string;
  minTotal?: number;
}

export type OrderEvent =
  | { kind: 'order.created'; orderId: OrderId }
  | { kind: 'order.paid'; orderId: OrderId; paymentId: Brand<string, 'PaymentId'> }
  | { kind: 'order.fulfilled'; orderId: OrderId; shipped: string }
  | { kind: 'order.cancelled'; orderId: OrderId; reason: string };

export const orderEventName = (event: OrderEvent): string => event.kind;

export const computeSubtotal = (lines: OrderLine[]): Money => {
  const out = lines.reduce(
    (acc, line) => {
      const lineTotal = line.unitPrice.amount * line.quantity * (1 - (line.discount ?? 0));
      if (acc.currency !== line.unitPrice.currency) throw new Error('currency mismatch');
      return { currency: acc.currency, amount: acc.amount + lineTotal };
    },
    { currency: 'USD', amount: 0 } as Money
  );
  return out;
};

export const attachPurchase = (order: Order, purchaseId: PurchaseId): Order => ({
  ...order,
  purchaseId,
});
