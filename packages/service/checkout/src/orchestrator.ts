import { Order } from '@domain/orders';
import { settleInvoice } from '@domain/billing';
import { MessageBus, createEnvelope } from '@platform/messaging';
import { Invoice, BillingPolicy } from '@domain/billing';
import { EventEnvelope } from '@shared/protocol';

export interface CheckoutInput {
  order: Order;
  invoice: Invoice;
  bus: MessageBus;
  policy: BillingPolicy;
}

export interface CheckoutResult {
  order: Order;
  billed: boolean;
  invoice: Invoice;
}

export const checkout = async (input: CheckoutInput): Promise<CheckoutResult | Error> => {
  if (input.order.lines.length === 0) return new Error('empty order');

  const settled = await settleInvoice(input.invoice, input.policy);
  if (!settled.ok) return settled.error;

  const envelope: EventEnvelope<{ order: Order; invoice: Invoice }> = createEnvelope('checkout.completed', {
    order: input.order,
    invoice: settled.value,
  }) as EventEnvelope<{ order: Order; invoice: Invoice }>;

  await input.bus.publish('checkout.events' as any, envelope as any);

  return {
    order: input.order,
    billed: true,
    invoice: settled.value,
  };
};

export const emitOrderEvent = (eventName: string, order: Order): EventEnvelope<Order> => {
  return createEnvelope(eventName, order) as EventEnvelope<Order>;
};
