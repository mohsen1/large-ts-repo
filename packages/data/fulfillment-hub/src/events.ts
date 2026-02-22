import { Brand } from '@shared/core';
import { FulfillmentExecution, FulfillmentPlan, FulfillmentRunId } from '@domain/fulfillment-orchestration';
import { Envelope, createEnvelope } from '@shared/protocol';

export type FulfillmentEventName =
  | 'fulfillment.plan.created'
  | 'fulfillment.run.started'
  | 'fulfillment.run.updated'
  | 'fulfillment.run.completed'
  | 'fulfillment.run.failed';

export interface FulfillmentEvent<T extends FulfillmentEventName, TPayload> {
  name: T;
  planId: Brand<string, 'FulfillmentId'>;
  runId?: FulfillmentRunId;
  payload: TPayload;
  timestamp: string;
}

export const toEnvelope = <T>(name: FulfillmentEventName, payload: T): Envelope<T> => {
  return createEnvelope(name, payload);
};

export interface PlanCreatedPayload {
  plan: FulfillmentPlan;
}

export interface RunUpdatedPayload {
  run: FulfillmentExecution;
  details: string;
}
