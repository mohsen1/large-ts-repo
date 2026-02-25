import { withBrand } from '@shared/core';
import type {
  Brand,
  PageArgs,
  PageResult,
} from '@shared/core';
import {
  type NoInfer,
  type RecursivePath,
  type Prettify,
} from '@shared/type-level';

export const observabilityScopes = ['playbook', 'platform', 'signal', 'policy', 'workflow', 'incident'] as const;
export type ObservabilityScope = (typeof observabilityScopes)[number];

export const observabilityLifecycleStages = ['seeded', 'observed', 'correlated', 'analyzed', 'forecasted', 'remediated', 'closed'] as const;
export type ObservabilityLifecycleStage = (typeof observabilityLifecycleStages)[number];

export type ObservabilityTenantId = Brand<string, 'ObservabilityTenantId'>;
export type ObservabilityPlaybookId = Brand<string, 'ObservabilityPlaybookId'>;
export type ObservabilityRunId = Brand<string, 'ObservabilityRunId'>;
export type ObservabilitySessionId = Brand<string, 'ObservabilitySessionId'>;
export type ObservabilitySignalId = Brand<string, 'ObservabilitySignalId'>;
export type ObservabilityMetricId = Brand<string, 'ObservabilityMetricId'>;

export type MetricTag<TScope extends ObservabilityScope = ObservabilityScope> = `${TScope}:${string & {}}`;
export type MetricPath<T extends string> = `metric.${T}`;

export type SignalDimension<T extends string = string> = `${T & string}:${ObservabilityScope}`;

export type ScopeTuple<T extends readonly ObservabilityScope[]> = T extends readonly [
  infer Head extends ObservabilityScope,
  ...infer Rest extends readonly ObservabilityScope[],
]
  ? readonly [Head, ...ScopeTuple<Rest>]
  : readonly [];

export type ScopeTemplate<TPrefix extends string, TScopes extends readonly ObservabilityScope[]> = TScopes extends readonly [
  infer Head extends ObservabilityScope,
  ...infer Rest extends readonly ObservabilityScope[],
]
  ? Rest['length'] extends 0
    ? `${TPrefix}:${Head}`
    : `${TPrefix}:${Head}:${ScopeTemplate<TPrefix, Rest>}`
  : TPrefix;

export type RecursiveMetric<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Rest
]
  ? readonly [Head, ...RecursiveMetric<Rest>]
  : readonly [];

export type TenantId<T extends string = string> = Brand<T, 'ObservabilityTenantId'>;

export interface ObservabilityEnvelope<
  TTenant extends string = string,
  TScope extends ObservabilityScope = ObservabilityScope,
  TPayload = unknown,
> {
  readonly tenant: TenantId<TTenant>;
  readonly scope: TScope;
  readonly scopePath: ScopeTemplate<TScope, ScopeTuple<[TScope]>>;
  readonly payload: TPayload;
  readonly capturedAt: string;
}

export interface ObservabilityPolicy {
  readonly name: string;
  readonly windowMs: number;
  readonly maxEventSpan: number;
  readonly requireCorrelation: boolean;
  readonly allowedScopes: readonly ObservabilityScope[];
}

export const observabilityDefaults = {
  policy: {
    name: 'steady',
    windowMs: 30_000,
    maxEventSpan: 420,
    requireCorrelation: true,
    allowedScopes: ['playbook', 'workflow', 'signal', 'policy', 'platform', 'incident'],
  } as const satisfies ObservabilityPolicy,
  window: {
    limit: 128,
    cursor: 'cursor:default',
  } as const satisfies PageArgs,
} satisfies {
  readonly policy: ObservabilityPolicy;
  readonly window: PageArgs;
};

export interface PlaybookRuntimeMetrics<TScope extends ObservabilityScope = ObservabilityScope> {
  readonly scope: TScope;
  readonly score: number;
  readonly drift: number;
  readonly variance: number;
  readonly confidence: number;
  readonly trend: 'increasing' | 'decreasing' | 'steady';
}

export interface ObservabilityContext<TScopes extends readonly ObservabilityScope[] = readonly ObservabilityScope[]> {
  readonly tenantId: TenantId<string>;
  readonly playbookId: ObservabilityPlaybookId;
  readonly runId: ObservabilityRunId;
  readonly sessionId: ObservabilitySessionId;
  readonly scopes: TScopes;
  readonly stage: ObservabilityLifecycleStage;
  readonly tags: ScopeTuple<TScopes>;
  readonly createdAt: string;
}

export interface ObservabilityMetricRecord<TValue = unknown> {
  readonly metricId: ObservabilityMetricId;
  readonly tenantId: ObservabilityTenantId;
  readonly playbookId: ObservabilityPlaybookId;
  readonly name: MetricTag<ObservabilityScope>;
  readonly scope: ObservabilityScope;
  readonly value: TValue;
  readonly unit: 'ms' | 'count' | 'ratio' | 'score';
  readonly path: MetricPath<string>;
  readonly emittedAt: string;
}

export type ObservabilityResult<T> = T extends {
  readonly tenantId: infer Tenant
}
  ? Tenant extends string
    ? Prettify<T>
    : never
  : never;

export interface ObservabilityTenantPage<TItem> extends PageResult<TItem> {
  readonly cursor?: string;
}

export interface ObservabilityProjection<TScopes extends readonly ObservabilityScope[] = readonly ObservabilityScope[]> {
  readonly tenantId: TenantId<string>;
  readonly scopes: TScopes;
  readonly focusPath: RecursivePath<NoInfer<TScopes>>;
  readonly enabled: boolean;
}

export type TimelineRow<TValue> = [ObservabilitySignalId, TValue, number];

export const tenantId = <T extends string>(value: T): ObservabilityTenantId =>
  withBrand(`${value}:tenant`, 'ObservabilityTenantId');

export const playbookId = <T extends string>(tenant: T, value: string): ObservabilityPlaybookId =>
  withBrand(`pb/${tenant}/${value}`, 'ObservabilityPlaybookId');

export const runId = (tenantIdValue: ObservabilityTenantId, index: number): ObservabilityRunId =>
  withBrand(`${tenantIdValue}:run:${index}:${Date.now()}`, 'ObservabilityRunId');

export const sessionId = (tenantIdValue: ObservabilityTenantId, run: ObservabilityRunId): ObservabilitySessionId =>
  withBrand(`${tenantIdValue}:session:${run}`, 'ObservabilitySessionId');

export const signalId = (tenant: ObservabilityTenantId, scope: ObservabilityScope, signal: string): ObservabilitySignalId =>
  withBrand(`${tenant}:${scope}:signal:${signal}`, 'ObservabilitySignalId');

export const metricId = (metric: string, runIdValue: ObservabilityRunId): ObservabilityMetricId =>
  withBrand(`${metric}::${runIdValue}`, 'ObservabilityMetricId');

export const metricName = <TScope extends ObservabilityScope>(scope: TScope, name: string): MetricTag<TScope> =>
  `${scope}:${name}` as MetricTag<TScope>;

export const toObservabilityContext = <const TScopes extends readonly ObservabilityScope[]>({
  tenantIdValue,
  playbook,
  run,
  scopes,
  stage,
  tagSeed,
}: {
  readonly tenantIdValue: string;
  readonly playbook: string;
  readonly run: string;
  readonly scopes: NoInfer<TScopes>;
  readonly stage: ObservabilityLifecycleStage;
  readonly tagSeed: string;
}): ObservabilityContext<TScopes> => {
  const scopeTuple = (scopes: TScopes): ScopeTuple<TScopes> => scopes as unknown as ScopeTuple<TScopes>;
  const tenant = tenantId(tenantIdValue);
  return {
    tenantId: tenant,
    playbookId: playbookId(tenantIdValue, playbook),
    runId: runId(tenant, Number.isNaN(Number(run)) ? 0 : Number(run)),
    sessionId: sessionId(tenant, runId(tenant, 0)),
    scopes,
    stage,
    tags: scopeTuple(scopes),
    createdAt: `${tagSeed}:${tenantIdValue}:${new Date().toISOString()}`,
  };
};

export const mapScopeSignature = <const TScope extends ObservabilityScope>(scope: TScope): `${TScope}/observation` =>
  `${scope}/observation`;

export const mapScopeByPolicy = (scope: ObservabilityScope): boolean =>
  observabilityScopes.includes(scope);

export const metricNameFromPath = (parts: readonly string[]): string =>
  parts.length > 0 ? (`metric.${parts.join('.')}` as const) : 'metric.unknown';

export const normalizeScopes = (scopes: readonly string[]): readonly ObservabilityScope[] =>
  scopes.filter((scope): scope is ObservabilityScope => observabilityScopes.includes(scope as ObservabilityScope));
