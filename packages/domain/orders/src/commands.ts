import { OrderId, PurchaseId, OrderState, OrderLine } from './types';

export interface CreateOrderCommand {
  tenantId: string;
  purchaserId: string;
  lines: OrderLine[];
}

export interface UpdateOrderStateCommand {
  orderId: OrderId;
  state: OrderState;
}

export interface AssignShipmentCommand {
  orderId: OrderId;
  shipmentId: string;
}

export interface PayOrderCommand {
  orderId: OrderId;
  paymentId: string;
}

export interface RefundOrderCommand {
  orderId: OrderId;
  purchaseId: PurchaseId;
  reason: string;
}

export type OrderCommand =
  | { action: 'create'; payload: CreateOrderCommand }
  | { action: 'state'; payload: UpdateOrderStateCommand }
  | { action: 'ship'; payload: AssignShipmentCommand }
  | { action: 'pay'; payload: PayOrderCommand }
  | { action: 'refund'; payload: RefundOrderCommand };

export const commandType = (command: OrderCommand): string => command.action;
