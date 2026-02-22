import { Brand } from '@shared/core';
import { DeepMerge, Merge, Prettify } from '@shared/type-level';

export type OperationId = Brand<string, 'OperationId'>;
export type EnvironmentId = Brand<string, 'EnvironmentId'>;
export type DeploymentId = Brand<string, 'DeploymentId'>;
export type RunbookId = Brand<string, 'OperationsRunbookId'>;

export type Severity = 'none' | 'minor' | 'major' | 'critical';
export type WindowKind = 'maintenance' | 'freeze' | 'safety' | 'recovery';
export type StepState = 'planned' | 'running' | 'blocked' | 'succeeded' | 'failed';

export interface OperationWindow {
  startsAt: string;
  endsAt: string;
  kind: WindowKind;
}

export interface ServiceDependency {
  serviceId: Brand<string, 'ServiceId'>;
  required: boolean;
  blastRadius: 'low' | 'medium' | 'high';
}

export interface OperationSignal<C extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  weight: number;
  context?: C;
  emittedAt: string;
}

export interface OperationConstraint {
  maxConcurrentOperations: number;
  minHealthyPercent: number;
  blockedSeverities: readonly Severity[];
  allowedRegions: readonly string[];
}

export interface OperationStep<C extends Record<string, unknown> = Record<string, unknown>> {
  key: Brand<string, 'StepKey'>;
  command: string;
  owner: string;
  estimatedMinutes: number;
  requiredSignals?: readonly string[];
  metadata?: C;
}

export interface OperationPlan<TMetadata = Record<string, unknown>> {
  id: OperationId;
  environmentId: EnvironmentId;
  deploymentId: DeploymentId;
  runbookId: RunbookId;
  requestedAt: string;
  window: OperationWindow;
  steps: readonly OperationStep<TMetadata>[];
  constraints: OperationConstraint;
  riskSignals: readonly OperationSignal<TMetadata>[];
  severity: Severity;
  labels?: readonly string[];
}

export interface PlanDraft<C extends Record<string, unknown> = Record<string, unknown>> {
  readonly requestedAt: string;
  readonly environmentId: EnvironmentId;
  readonly deploymentId: DeploymentId;
  readonly runbookId: RunbookId;
  readonly window: OperationWindow;
  readonly baseSteps: readonly OperationStep<C>[];
  readonly dependencies: readonly ServiceDependency[];
  readonly constraints: Partial<OperationConstraint>;
  readonly severity: Severity;
}

export interface PlanDecision<C extends Record<string, unknown> = Record<string, unknown>> {
  planId: OperationId;
  allowed: boolean;
  reasons: readonly string[];
  selectedAt: string;
  payload: Readonly<C>;
}

export type StepSelector<TStep extends OperationStep, TAcc extends Record<string, unknown> = Record<string, unknown>> = (
  step: TStep,
  index: number,
) => boolean;

export type Replace<T, K extends keyof T, V> = Omit<T, K> & { [P in K]: V };
export type OptionalToRequired<T> = {
  [K in keyof T]-?: NonNullable<T[K]>;
};

export type MergedConstraints<A extends Partial<OperationConstraint>, B extends Partial<OperationConstraint>> = Prettify<
  Merge<A, Omit<B, keyof A>>
>;

export type NormalizedConstraint<T extends OperationConstraint | Partial<OperationConstraint>> = T extends OperationConstraint
  ? T
  : Prettify<
      MergedConstraints<
        {
          maxConcurrentOperations: number;
          minHealthyPercent: number;
          blockedSeverities: readonly Severity[];
          allowedRegions: readonly string[];
        },
        T
      >
    >;

export interface DeploymentTrace {
  env: EnvironmentId;
  deployment: DeploymentId;
  timestamp: string;
}

export interface PolicyBundle {
  name: string;
  owner: string;
  constraints: OperationConstraint[];
  labels?: string[];
}

export interface ExecutionEnvelope<T = unknown> {
  kind: string;
  requestId: Brand<string, 'ExecutionRequestId'>;
  tenantId: Brand<string, 'TenantId'>;
  payload: T;
  initiatedAt: string;
}

export type Weighted<T extends Record<string, unknown>> = Prettify<{ [K in keyof T]: T[K] & { readonly weight: number } }>;

export const asOperationId = (value: string): OperationId => value as OperationId;
export const asDeploymentId = (value: string): DeploymentId => value as DeploymentId;
export const asRunbookId = (value: string): RunbookId => value as RunbookId;
export const asEnvironmentId = (value: string): EnvironmentId => value as EnvironmentId;

export const normalizeWindow = (window: OperationWindow): OperationWindow => {
  const startsAt = new Date(window.startsAt);
  const endsAt = new Date(window.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error('Window timestamps must be valid ISO dates');
  }
  return {
    ...window,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizeConstraint = <T extends Partial<OperationConstraint>>(input: T): NormalizedConstraint<T> =>
  ({
    maxConcurrentOperations: clamp(input.maxConcurrentOperations ?? 1, 1, 1000),
    minHealthyPercent: clamp(input.minHealthyPercent ?? 70, 0, 100),
    blockedSeverities: input.blockedSeverities ?? ['critical'],
    allowedRegions: input.allowedRegions ?? ['us-east-1'],
  }) as NormalizedConstraint<T>;

export const calculateSignalStrength = <T extends Record<string, unknown>>(signals: readonly OperationSignal<T>[]): number =>
  signals.reduce((total, signal) => {
    const weight = Number(signal.weight);
    return total + (Number.isFinite(weight) ? weight : 0);
  }, 0);

export const isWindowOverlapping = (left: OperationWindow, right: OperationWindow): boolean => {
  const startA = Date.parse(left.startsAt);
  const endA = Date.parse(left.endsAt);
  const startB = Date.parse(right.startsAt);
  const endB = Date.parse(right.endsAt);
  if (!Number.isFinite(startA) || !Number.isFinite(endA) || !Number.isFinite(startB) || !Number.isFinite(endB)) {
    return false;
  }
  return startA <= endB && startB <= endA;
};

export const estimatePlanMinutes = (steps: readonly OperationStep[]): number =>
  steps.reduce((sum, step) => sum + Math.max(1, Number(step.estimatedMinutes || 0)), 0);

export const mergeDependencies = (left: readonly ServiceDependency[], right: readonly ServiceDependency[]): readonly ServiceDependency[] =>
  [...left, ...right].filter((value, index, all) =>
    all.findIndex((item) => item.serviceId === value.serviceId && item.required === value.required) === index,
  );

export const mergeSignals = <T extends Record<string, unknown>>(
  left: readonly OperationSignal<T>[],
  right: readonly OperationSignal<T>[],
): readonly OperationSignal<T>[] =>
  left
    .concat(right)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 25);

export type PlanEnvelope<TConfig = Record<string, unknown>> = Readonly<
  DeepMerge<
    OperationPlan<TConfig>,
    {
      metadata: {
        source: 'planner';
        version: 1;
        dependencies: ServiceDependency[];
      };
    }
  >
>;
