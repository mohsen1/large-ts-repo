import { Brand } from '@shared/core';
import { Order, OrderId } from '@domain/orders';
import { Money } from '@domain/billing';

export type FulfillmentId = Brand<string, 'FulfillmentId'>;
export type ShipmentId = Brand<string, 'ShipmentId'>;
export type FulfillmentRunId = Brand<string, 'FulfillmentRunId'>;

export type StepState =
  | 'queued'
  | 'eligible'
  | 'allocated'
  | 'picked'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'closed'
  | 'failed';

export interface FulfillmentWindow {
  start: string;
  end: string;
}

export interface FulfillmentStep<TContext = unknown> {
  id: Brand<string, 'FulfillmentStep'>;
  kind: string;
  state: StepState;
  description: string;
  dependsOn: readonly string[];
  context: TContext;
}

export interface FulfillmentPlan<TContext = unknown> {
  id: FulfillmentId;
  tenantId: Brand<string, 'TenantId'>;
  orderId: OrderId;
  strategy: FulfillmentStrategy;
  steps: ReadonlyArray<FulfillmentStep<TContext>>;
  createdAt: string;
  dueAt?: string;
  window?: FulfillmentWindow;
}

export interface FulfillmentExecution {
  runId: FulfillmentRunId;
  planId: FulfillmentId;
  status: 'running' | 'suspended' | 'cancelled' | 'done' | 'errored';
  traceId: Brand<string, 'TraceId'>;
  startedAt: string;
  finishedAt?: string;
  currentStep?: Brand<string, 'FulfillmentStep'>;
}

export interface FulfillmentEstimate {
  totalLeadMinutes: number;
  laborCost: Money;
  transportCost: Money;
  riskScore: number;
}

export interface FulfillmentPolicy {
  allowSplitFulfillment: boolean;
  maxConcurrentRuns: number;
  riskThreshold: number;
  requiredSkills: readonly string[];
}

export type FulfillmentStrategy = 'standard' | 'express' | 'cold-chain' | 'international';

export interface Slot<T> {
  readonly value: T;
  readonly rank: number;
}

export type Ordered<T> = Array<T> & { readonly __ordered_brand: unique symbol };

export type ResultMap<TData extends Record<string, unknown>> = {
  [K in keyof TData]: { readonly kind: K; readonly payload: TData[K] };
}[keyof TData];

export interface PlanCandidate {
  id: Brand<string, 'PlanCandidate'>;
  orderId: OrderId;
  riskLevel: number;
  estimate: FulfillmentEstimate;
}

export interface PlanContext {
  order: Order;
  tenantId: string;
  warehouseId: string;
}

export type StepVisitor<TContext, TResult> = (step: FulfillmentStep<TContext>, plan: FulfillmentPlan<TContext>) => TResult;

export const isTerminalState = (state: StepState): boolean => ['closed', 'failed'].includes(state);

export const rankStep = <T>(step: FulfillmentStep<T>, rank: number): Slot<T> => ({
  value: step.context,
  rank,
});

export const markAsOrdered = <T>(items: T[]): Ordered<T> => items.slice().sort() as Ordered<T>;
