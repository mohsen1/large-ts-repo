import { Order, OrderEvent } from '@domain/orders';
import { Invoice } from '@domain/billing';
import { NotFoundError } from '@shared/errors';

export const assertOrderReady = (order: Order): void => {
  if (order.state !== 'submitted') {
    throw new Error(`order ${order.id} not ready`);
  }
};

export const assertInvoiceReady = (invoice: Invoice): void => {
  if (invoice.settled) {
    throw new Error(`invoice ${invoice.id} settled`);
  }
};

export const explain = (event: OrderEvent): string => event.kind;

export const requireTenant = (order: Order, tenantId: string): Order => {
  if (order.tenantId !== tenantId) {
    throw new NotFoundError('tenant', String(tenantId));
  }
  return order;
};
