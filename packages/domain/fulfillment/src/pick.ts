import { Brand } from '@shared/core';

export type PickerId = Brand<string, 'PickerId'>;

export interface PickInstruction {
  orderId: string;
  sku: string;
  qty: number;
  zone: string;
}

export interface PickJob {
  id: string;
  instructions: PickInstruction[];
  assignedTo?: PickerId;
}

export const assign = (job: PickJob, picker: PickerId): PickJob => ({
  ...job,
  assignedTo: picker,
});

export const allocate = (orders: readonly string[]): PickJob[] => {
  return orders.map((id, index) => ({
    id: `pick-${index}-${id}`,
    instructions: [{ orderId: id, sku: `sku-${index}`, qty: 1, zone: `zone-${index % 4}` }],
  }));
};
