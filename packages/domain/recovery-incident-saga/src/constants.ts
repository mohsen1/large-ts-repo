import type { Brand } from '@shared/core';
import type { NodeId } from '@shared/core';

export type RecoverySagaDomain = 'incident-saga';
export const sagaDomain = 'incident-saga' as const;

export type SagaRunId = Brand<string, 'SagaRunId'>;
export type SagaRunStepId = Brand<string, 'SagaRunStepId'>;
export type SagaRunPolicyId = Brand<string, 'SagaRunPolicyId'>;
export type SagaGraphNodeId = NodeId;

export const sagaPhases = ['prepare', 'activate', 'execute', 'audit', 'retire'] as const;
export type SagaPhase = (typeof sagaPhases)[number];

export type SagaPriority = 'critical' | 'high' | 'normal' | 'low';
export type StageId<T extends string> = `${T}::${SagaPhase}`;
export type StepId<T extends string, L extends number> = `${T}:${L}-${string}`;

export interface SagaDomainMeta {
  readonly domain: RecoverySagaDomain;
  readonly version: `${number}.${number}.${number}`;
  readonly supportedPhases: readonly SagaPhase[];
  readonly supportedRegions: readonly string[];
}

export const defaultDomainMeta: SagaDomainMeta = {
  domain: sagaDomain,
  version: '1.0.0',
  supportedPhases: sagaPhases,
  supportedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
} as const satisfies SagaDomainMeta;

export type SagaDepth<T extends number> = {
  readonly [K in T]: Brand<string, 'SagaRunStepId'>;
};

export type SagaRegion = 'us-east-1' | 'us-west-2' | 'eu-west-1';
export const defaultPluginNamespace = 'incident-saga' as const;

export const phaseToColor = {
  prepare: '#4f46e5',
  activate: '#0891b2',
  execute: '#15803d',
  audit: '#ca8a04',
  retire: '#6b7280',
} satisfies Record<SagaPhase, `#${string}`>;

export const asPhase = <T extends string>(value: T): SagaPhase => {
  if (sagaPhases.includes(value as SagaPhase)) {
    return value as SagaPhase;
  }
  return 'prepare';
};

export const makeRunId = (seed: string): SagaRunId => `${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` as SagaRunId;

export const makeStepId = <T extends string>(namespace: T, index: number, suffix: string): StepId<T, typeof index> => {
  return `${namespace}:${index}-${suffix}` as StepId<T, typeof index>;
};

export const rankToPriority = <T extends SagaPriority>(value: number): T =>
  (value >= 0.75 ? 'critical' : value >= 0.5 ? 'high' : value >= 0.25 ? 'normal' : 'low') as T;

export const mapPriority = (priority: SagaPriority): number => {
  const values: Record<SagaPriority, number> = {
    critical: 100,
    high: 70,
    normal: 40,
    low: 10,
  };
  return values[priority];
};
