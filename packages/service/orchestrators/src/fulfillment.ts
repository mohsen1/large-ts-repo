import { Order } from '@domain/orders';
import { reserve, commit } from '@domain/inventory';

export interface FulfillmentInput {
  order: Order;
  sku: string;
}

const inventoryIndex: Record<string, any> = {};

export const pickCell = (sku: string) => inventoryIndex[sku] ?? { sku, warehouseId: 'default', onHand: 100, reserved: 0, available: 100 };

export const lock = (input: FulfillmentInput): Order => {
  const qty = input.order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const cell = pickCell(input.sku);
  const reserved = reserve(cell, qty);
  inventoryIndex[input.sku] = reserved;
  return { ...input.order };
};

export const finalize = (input: FulfillmentInput): Order => {
  const qty = input.order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const cell = pickCell(input.sku);
  const committed = commit(cell, qty);
  inventoryIndex[input.sku] = committed;
  return { ...input.order };
};
