import { Order, OrderLine, OrderState, computeSubtotal } from './types';
import { fail, ok } from '@shared/result';
import { CreateOrderCommand, UpdateOrderStateCommand, AssignShipmentCommand, PayOrderCommand, RefundOrderCommand } from './commands';
import { OrderId } from './types';

const validTransitions: Record<OrderState, readonly OrderState[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'cancelled'],
  fulfilled: ['refunded'],
  cancelled: ['draft'],
  refunded: [],
};

export const nextState = (state: OrderState, next: OrderState): boolean => {
  return validTransitions[state].includes(next);
};

export const createOrder = async (cmd: CreateOrderCommand): Promise<ReturnType<typeof ok | typeof fail>> => {
  if (cmd.lines.length === 0) return fail(new Error('no lines'));
  const subtotal = computeSubtotal(cmd.lines);
  const order = {
    id: `ord-${Date.now()}` as OrderId,
    purchaserId: cmd.purchaserId as any,
    tenantId: cmd.tenantId as any,
    lines: cmd.lines,
    createdAt: new Date().toISOString(),
    state: 'draft' as OrderState,
    subtotal,
    total: subtotal,
  };
  return ok(order as Order);
};

export const updateState = async (current: Order, patch: UpdateOrderStateCommand) => {
  if (!nextState(current.state, patch.state)) return fail(new Error('illegal transition'));
  return ok({ ...current, state: patch.state });
};

export const assignShipment = async (order: Order, cmd: AssignShipmentCommand) => {
  if (order.state === 'cancelled') return fail(new Error('cancelled order')); 
  return ok({ ...order, shipmentId: cmd.shipmentId, state: 'fulfilled' as OrderState });
};

export const recordPayment = async (order: Order, cmd: PayOrderCommand) => {
  if (order.state !== 'submitted') return fail(new Error('must be submitted'));
  return ok({ ...order, state: 'paid' as OrderState, purchaseId: cmd.paymentId as any });
};

export const refund = async (order: Order, cmd: RefundOrderCommand) => {
  if (order.state !== 'paid' && order.state !== 'fulfilled') return fail(new Error('invalid state'));
  return ok({ ...order, state: 'refunded' as OrderState });
};

export const estimateWeight = (lines: readonly OrderLine[]): number =>
  lines.reduce((sum, line) => sum + Math.max(1, line.quantity), 0) * 0.25;
