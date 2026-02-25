import { z } from 'zod';
import { withBrand, type Brand, type ReadonlyDeep } from '@shared/core';
import type { KeyPaths, PathValue, NonEmptyArray } from '@shared/type-level';

export const AUTONOMY_SCOPE_SEQUENCE = ['discover', 'simulate', 'assess', 'orchestrate', 'verify', 'heal'] as const;
export type AutonomyScope = (typeof AUTONOMY_SCOPE_SEQUENCE)[number];

export const AUTONOMY_SEVERITIES = ['ok', 'warning', 'critical', 'critical+'] as const;
export type AutonomySeverity = (typeof AUTONOMY_SEVERITIES)[number];

export const AUTONOMY_CHANNELS = ['telemetry', 'policy', 'incident', 'repair', 'simulation'] as const;
export type AutonomyChannel = (typeof AUTONOMY_CHANNELS)[number];

export type AutonomyRunId = Brand<string, 'AutonomyRunId'>;
export type AutonomyGraphId = Brand<string, 'AutonomyGraphId'>;
export type AutonomySignalId = Brand<string, 'AutonomySignalId'>;
export type AutonomyPlanId = Brand<string, 'AutonomyPlanId'>;
export type AutonomyNodeId = Brand<string, 'AutonomyNodeId'>;
export type AutonomyRequestId = Brand<string, 'AutonomyRequestId'>;

export type AutonomyNodeRole = 'source' | 'processor' | 'validator' | 'actuator' | 'auditor';

export const severityRanking = {
  ok: 0,
  warning: 15,
  critical: 75,
  'critical+': 100,
} satisfies Record<AutonomySeverity, number>;

export type ScopeTupleFrom<T extends readonly AutonomyScope[]> = T extends readonly [
  infer Head extends AutonomyScope,
  ...infer Tail extends readonly AutonomyScope[],
]
  ? readonly [Head, ...ScopeTupleFrom<Tail>]
  : readonly [];

export type PathByScope<T extends AutonomyScope = AutonomyScope> = `${T}:${string}`;
export type SeverityFromScore<TScore extends number> =
  TScore extends 0 | 1 | 2 | 3 | 4 | 5
    ? 'ok'
    : TScore extends 6 | 7 | 8 | 9 | 10
      ? 'warning'
      : TScore extends 11 | 12 | 13 | 14 | 15
        ? 'critical'
        : 'critical+';

export interface AutonomyNode<TMetadata extends Record<string, unknown> = Record<string, never>> {
  readonly nodeId: AutonomyNodeId;
  readonly role: AutonomyNodeRole;
  readonly scope: AutonomyScope;
  readonly channel: AutonomyChannel;
  readonly metadata: ReadonlyDeep<TMetadata>;
}

export interface AutonomySignalInput<TScope extends AutonomyScope = AutonomyScope, TPayload = unknown> {
  readonly scope: TScope;
  readonly graphId: AutonomyGraphId;
  readonly runId: AutonomyRunId;
  readonly source: string;
  readonly payload: TPayload;
  readonly channel: AutonomyChannel;
  readonly tags: readonly string[];
}

export interface AutonomySignalEnvelope<TScope extends AutonomyScope = AutonomyScope, TPayload = unknown> {
  readonly signalId: AutonomySignalId;
  readonly signalType: PathByScope<TScope>;
  readonly scope: TScope;
  readonly graphId: AutonomyGraphId;
  readonly runId: AutonomyRunId;
  readonly score: number;
  readonly severity: AutonomySeverity;
  readonly input: AutonomySignalInput<TScope, TPayload>;
  readonly observedAt: string;
}

export interface AutonomyGraph {
  readonly graphId: AutonomyGraphId;
  readonly tenantId: string;
  readonly runId: AutonomyRunId;
  readonly stages: NonEmptyArray<AutonomyScope>;
  readonly nodes: readonly AutonomyNode[];
  readonly links: readonly [AutonomyNodeId, AutonomyNodeId, number][];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AutonomyPlan<TStages extends readonly AutonomyScope[] = readonly AutonomyScope[]> {
  readonly planId: AutonomyPlanId;
  readonly scopeTuple: ScopeTupleFrom<TStages>;
  readonly stages: TStages;
  readonly expectedDurations: readonly number[];
  readonly createdAt: string;
}

export interface AutonomyExecutionOutput<
  TScope extends AutonomyScope = AutonomyScope,
  TPayload = unknown,
  TOutput = unknown,
> {
  readonly signal: AutonomySignalEnvelope<TScope, TPayload>;
  readonly output: TOutput;
  readonly diagnostics: readonly string[];
}

export const scopeTuple = <T extends readonly AutonomyScope[]>(stages: T): ScopeTupleFrom<T> =>
  stages as unknown as ScopeTupleFrom<T>;

export const makeSignalType = <T extends AutonomyScope>(scope: T, source: string): PathByScope<T> => {
  return `${scope}:${source}` as PathByScope<T>;
};

export const asRunId = (value: string): AutonomyRunId => withBrand(`run:${value}`, 'AutonomyRunId');
export const asGraphId = (value: string): AutonomyGraphId => withBrand(`graph:${value}`, 'AutonomyGraphId');
export const asNodeId = (value: string): AutonomyNodeId => withBrand(`node:${value}`, 'AutonomyNodeId');
export const asPlanId = (value: string): AutonomyPlanId => withBrand(`plan:${value}`, 'AutonomyPlanId');
export const asSignalId = (value: string): AutonomySignalId => withBrand(`signal:${value}`, 'AutonomySignalId');
export const asRequestId = (value: string): AutonomyRequestId => withBrand(`request:${value}`, 'AutonomyRequestId');

export const inferSeverityFromScore = (score: number): AutonomySeverity => {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  if (normalized >= severityRanking['critical+']) return 'critical+';
  if (normalized >= severityRanking.critical) return 'critical';
  if (normalized >= severityRanking.warning) return 'warning';
  return 'ok';
};

export const toDiagnosticSignal = <TScope extends AutonomyScope, TPayload = unknown>(
  input: AutonomySignalInput<TScope, TPayload>,
  score: number,
  payload: unknown,
): AutonomySignalEnvelope<TScope, unknown> => {
  const payloadLabel = typeof payload === 'object' && payload !== null && 'kind' in payload
    ? String((payload as Record<string, unknown>).kind)
    : 'runtime';

  return {
    signalId: asSignalId(`diag:${input.scope}:${Date.now()}`),
    signalType: makeSignalType(input.scope, `${input.source}:${payloadLabel}`),
    scope: input.scope,
    graphId: input.graphId,
    runId: input.runId,
    score,
    severity: inferSeverityFromScore(score),
    input: {
      ...input,
      payload,
      tags: [...input.tags, 'diagnostic'],
    },
    observedAt: new Date().toISOString(),
  };
};

const scopePathSchema = z
  .tuple([z.enum(AUTONOMY_SCOPE_SEQUENCE), z.string().min(1)])
  .transform(([scope, signal]) => `${scope}:${signal}`);

export const parseScopePath = <TScope extends AutonomyScope>(value: string): PathByScope<TScope> =>
  scopePathSchema.parse(value.split(':')) as unknown as PathByScope<TScope>;

const nodeSchema = z.object(
  {
    nodeId: z.string().min(3),
    role: z.enum(['source', 'processor', 'validator', 'actuator', 'auditor']),
    scope: z.enum(AUTONOMY_SCOPE_SEQUENCE),
    channel: z.enum(AUTONOMY_CHANNELS),
    metadata: z.record(z.unknown()),
  },
  {
    invalid_type_error: 'invalid autonomy node',
  },
);

export const signalSchema = z.object({
  signalId: z.string(),
  signalType: z.string(),
  scope: z.enum(AUTONOMY_SCOPE_SEQUENCE),
  graphId: z.string(),
  runId: z.string(),
  score: z.number().min(0).max(100),
  severity: z.enum(AUTONOMY_SEVERITIES),
  input: z.object({
    scope: z.enum(AUTONOMY_SCOPE_SEQUENCE),
    graphId: z.string(),
    runId: z.string(),
    source: z.string(),
    payload: z.unknown(),
    channel: z.enum(AUTONOMY_CHANNELS),
    tags: z.array(z.string()),
  }),
  observedAt: z.string(),
});

const keyPaths = <T extends Record<string, unknown>>(value: T): string[] =>
  Object.entries(value).flatMap(([key, nested]) => {
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return [key, ...keyPaths(nested as Record<string, unknown>).map((segment) => `${key}.${segment}`)];
    }
    return [key];
  });

export const signalTuplePaths = <T extends Record<string, unknown>>(value: T): KeyPaths<T>[] => {
  return keyPaths(value) as unknown as KeyPaths<T>[];
};

export const signalTupleValue = <T, TPath extends string>(value: T, path: TPath): PathValue<T, TPath> => {
  const keys = path.split('.') as string[];
  let current: unknown = value;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
      continue;
    }
    return undefined as PathValue<T, TPath>;
  }

  return current as PathValue<T, TPath>;
};

export const summarizeSignalsByScope = (
  signals: readonly AutonomySignalEnvelope[],
): {
  readonly total: number;
  readonly byScope: Record<AutonomyScope, number>;
  readonly severityOrder: readonly AutonomySignalId[];
} => {
  const byScope = signals.reduce<Record<AutonomyScope, number>>((acc, signal) => {
    acc[signal.scope] = (acc[signal.scope] ?? 0) + 1;
    return acc;
  }, {} as Record<AutonomyScope, number>);

  return {
    total: signals.length,
    byScope,
    severityOrder: [...signals].toSorted((left, right) => right.score - left.score).map((signal) => signal.signalId),
  };
};

export const enrichPayload = <T extends Record<string, unknown>>(payload: T): {
  [K in keyof T as `payload_${Extract<K, string>}`]: T[K];
} => {
  return Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[`payload_${key}`] = value;
    return acc;
  }, {}) as {
    [K in keyof T as `payload_${Extract<K, string>}`]: T[K];
  };
};

export const validateNode = (value: unknown) => nodeSchema.parse(value);
