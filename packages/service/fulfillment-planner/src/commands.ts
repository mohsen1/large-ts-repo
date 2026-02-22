import { OrderId } from '@domain/orders';
import { FulfillmentStrategy } from '@domain/fulfillment-orchestration';

export interface SubmitFulfillmentCommand {
  orderId: OrderId;
  tenantId: string;
  strategy: FulfillmentStrategy;
  forceRun: boolean;
}

export interface AbortFulfillmentCommand {
  runId: string;
  reason: string;
}

export interface RetryFulfillmentCommand {
  runId: string;
  priority: number;
}

export type FulfillmentCommand =
  | { type: 'fulfillment.submit'; payload: SubmitFulfillmentCommand }
  | { type: 'fulfillment.abort'; payload: AbortFulfillmentCommand }
  | { type: 'fulfillment.retry'; payload: RetryFulfillmentCommand };

export const asSubmitCommand = (value: unknown): value is SubmitFulfillmentCommand => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'orderId' in value &&
    'tenantId' in value &&
    'strategy' in value
  );
};
