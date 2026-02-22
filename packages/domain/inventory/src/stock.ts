import { Brand } from '@shared/core';

export type InventoryId = Brand<string, 'InventoryId'>;

export interface StockCell {
  sku: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface InventorySnapshot {
  tenantId: string;
  cells: StockCell[];
  generatedAt: string;
}

export const clampStock = (value: number): number => Math.max(0, Math.floor(value));

export const buildAvailable = (cell: StockCell): number => {
  return clampStock(cell.onHand - cell.reserved);
};

export const canAllocate = (cell: StockCell, qty: number): boolean => {
  return buildAvailable(cell) >= qty;
};

export const reserve = (cell: StockCell, qty: number): StockCell => {
  if (!canAllocate(cell, qty)) throw new Error('insufficient');
  return { ...cell, reserved: cell.reserved + clampStock(qty) };
};

export const release = (cell: StockCell, qty: number): StockCell => {
  return { ...cell, reserved: Math.max(0, cell.reserved - clampStock(qty)) };
};

export const commit = (cell: StockCell, qty: number): StockCell => {
  const amount = clampStock(qty);
  if (amount > cell.reserved) throw new Error('invalid commit');
  return { ...cell, reserved: cell.reserved - amount, onHand: cell.onHand - amount };
};
