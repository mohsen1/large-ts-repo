import type { JsonObject, JsonValue, Brand } from '@shared/type-level';
import { asPolicyId, type EventKind, type NamespaceTag, type PolicyId, type RunId, type StageId, type TenantId } from './identifiers';
import type { RecursiveTuple } from '@shared/typed-orchestration-core';

export type EcosystemSeverity = 'info' | 'warn' | 'degrade' | 'critical';
export type LifecyclePhase = 'queued' | 'preflight' | 'running' | 'rollback' | 'completed' | 'aborted';
export type PolicyMode = 'advisory' | 'mandatory' | 'quarantine' | 'fail-open';
export type HealthScore = Brand<number, 'HealthScore'>;

export interface StageDependency {
  readonly from: StageId;
  readonly to: StageId;
  readonly reason: string;
  readonly weight: number;
}

export interface EcosystemMetric<TLabel extends string = string> {
  readonly name: `metric:${TLabel}`;
  readonly value: number;
  readonly unit: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface StageStateBase<TPayload extends JsonObject = JsonObject> {
  readonly id: StageId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: LifecyclePhase;
  readonly metrics: readonly EcosystemMetric[];
  readonly payload: TPayload;
}

export interface StageSnapshot<TPayload extends JsonObject = JsonObject> extends StageStateBase<TPayload> {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly commandId: string;
}

export interface RunSummary {
  readonly runId: RunId;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly status: LifecyclePhase;
  readonly score: HealthScore;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly stages: readonly StageSnapshot[];
}

export interface EcosystemPlan<TName extends string = string> {
  readonly id: `plan:${TName}`;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly name: TName;
  readonly phases: readonly StageConfig[];
  readonly maxConcurrency: 1 | 2 | 3 | 4 | 8;
  readonly policyIds: readonly PolicyId[];
}

export interface StageConfig {
  readonly id: StageId;
  readonly name: string;
  readonly plugin: PluginIdRef;
  readonly dependsOn: readonly StageId[];
  readonly severity: EcosystemSeverity;
  readonly timeoutMs: number;
  readonly retries: 0 | 1 | 2 | 3;
  readonly tags: readonly string[];
}

export type PluginIdRef = `plugin:${string}`;

export interface PluginRunRecord<TPayload extends JsonValue = JsonValue> {
  readonly plugin: PluginIdRef;
  readonly namespace: NamespaceTag;
  readonly stage: StageId;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly output: TPayload;
  readonly succeeded: boolean;
  readonly details: ReadonlyArray<string>;
}

export interface RecoveryRun<TPayload extends JsonObject = JsonObject, TPolicy extends PolicyMode = PolicyMode> {
  readonly id: RunId;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly plan: EcosystemPlan;
  readonly phase: LifecyclePhase;
  readonly policyMode: TPolicy;
  readonly snapshots: readonly StageSnapshot<TPayload>[];
  readonly records: readonly PluginRunRecord[];
  readonly warnings: RecursiveTuple<string, 6>;
}

export type PolicyMap<TPolicies extends readonly PolicyId[]> = {
  [Policy in TPolicies[number] as Policy['length'] extends 0 ? never : Policy]: {
    readonly enabled: true;
    readonly policy: Policy;
  };
};

export type MergePolicies<TLeft extends Record<string, unknown>, TRight extends Record<string, unknown>> = {
  readonly [K in keyof TLeft | keyof TRight]: K extends keyof TLeft
    ? K extends keyof TRight
      ? TLeft[K] & TRight[K]
      : TLeft[K]
    : K extends keyof TRight
      ? TRight[K]
      : never;
};

export type KeyedByNamespace<TRecord extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof TRecord as `${TPrefix}:${string & K}`]: TRecord[K];
};

export type StageInputByDefinition<TDefinitions extends readonly StageConfig[]> = {
  [K in TDefinitions[number] as K['id']]: {
    readonly namespace: K['id'];
    readonly stageId: K['id'];
  };
};

export type StageOutputByDefinition<TDefinitions extends readonly StageConfig[]> = {
  [K in TDefinitions[number] as K['id']]: {
    readonly output: JsonValue;
    readonly status: LifecyclePhase;
  };
};

export type EventEnvelope<TPayload extends Record<string, JsonValue>, TNamespace extends string = string> = {
  readonly kind: EventKind<string>;
  readonly namespace: NamespaceTag<TNamespace>;
  readonly at: string;
  readonly payload: TPayload;
};

export const asHealthScore = (value: number): HealthScore => {
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  return normalized as HealthScore;
};

export const isTerminalPhase = (phase: LifecyclePhase): phase is 'completed' | 'aborted' =>
  phase === 'completed' || phase === 'aborted';

export const isRunningPhase = (phase: LifecyclePhase): boolean =>
  phase === 'running' || phase === 'preflight';

export const hasStage = <TEntry extends { readonly id: StageId }>(
  entries: readonly TEntry[],
  stageId: StageId,
): stageId is TEntry['id'] => entries.some((entry) => entry.id === stageId);

export const buildDependencyMatrix = (dependencies: readonly StageDependency[]): Readonly<Record<StageId, readonly StageId[]>> => {
  const matrix: Record<string, StageId[]> = {};
  for (const dependency of dependencies) {
    matrix[dependency.to] = [...(matrix[dependency.to] ?? []), dependency.from];
  }
  return matrix as Readonly<Record<StageId, readonly StageId[]>>;
};

export const buildDependencyDepth = (dependencies: readonly StageDependency[], stageId: StageId): number => {
  const matrix = buildDependencyMatrix(dependencies);
  const queue = [...(matrix[stageId] ?? [])];
  let depth = 0;
  let cursor: readonly StageId[] = queue;
  while (cursor.length > 0) {
    depth += 1;
    const next: StageId[] = [];
    for (const current of cursor) {
      next.push(...(matrix[current] ?? []));
    }
    cursor = next;
  }
  return depth;
};

export const normalizeWarnings = <TValues extends readonly string[]>(values: TValues): {
  readonly red: readonly TValues[number][];
  readonly green: readonly TValues[number][];
} => {
  const red = values.filter((value) => value.includes('critical'));
  return {
    red,
    green: values.filter((value) => !value.includes('critical')),
  };
};

export const withDefaultPlan = (tenant: TenantId, namespace: NamespaceTag): EcosystemPlan => ({
  id: 'plan:default' as const,
  tenant,
  namespace,
  name: 'default',
  phases: [
    {
      id: 'stage:seed' as StageId,
      name: 'Seed',
      plugin: 'plugin:baseline' as const,
      dependsOn: [],
      severity: 'info',
      timeoutMs: 1200,
      retries: 1,
      tags: ['critical-path', 'seed'],
    },
    {
      id: 'stage:validate' as StageId,
      name: 'Validate',
      plugin: 'plugin:validator' as const,
      dependsOn: ['stage:seed' as StageId],
      severity: 'warn',
      timeoutMs: 2200,
      retries: 0,
      tags: ['validation', 'policy'],
    },
  ],
  maxConcurrency: 2,
  policyIds: [asPolicyId('standard'), asPolicyId('slo')] as const,
});

export const toPolicy = (policyId: PolicyId): { readonly policy: PolicyId; readonly ref: `ref:${string & PolicyId}` } => ({
  policy: policyId,
  ref: `ref:${policyId}`,
});

export const policyFromName = (value: string): PolicyId => {
  const normalized = value.trim().toLowerCase() || 'policy';
  return asPolicyId(normalized);
};

export const classifyWarnings = (values: readonly string[]): RecursiveTuple<string, 6> => {
  const normalized = [...values];
  while (normalized.length < 6) {
    normalized.push('none');
  }
  return normalized.slice(0, 6) as unknown as RecursiveTuple<string, 6>;
};
