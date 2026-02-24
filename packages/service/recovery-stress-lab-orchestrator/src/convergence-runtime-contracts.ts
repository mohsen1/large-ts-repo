import type {
  ConvergenceConstraint,
  ConvergenceInput,
  ConvergenceOutput,
  ConvergenceRunId,
  ConvergenceScope,
  ConvergenceStage,
} from '@domain/recovery-lab-orchestration-core';
import type { TenantId } from '@domain/recovery-stress-lab';

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type ScopedStage<TScope extends ConvergenceScope = ConvergenceScope> = `${TScope}:${ConvergenceStage}`;
export type StageFromScoped<T extends string> = T extends `${string}:${infer Stage}` ? Stage : never;
export type PluginName<T extends string, TStage extends ConvergenceStage> = `${T}-${TStage}-processor`;

export type ConvergenceRuntimeNode = Brand<string, 'ConvergenceRuntimeNode'>;
export type ConvergenceRuntimeToken = Brand<string, 'ConvergenceRuntimeToken'>;

export interface RuntimeEnvelope<TScope extends ConvergenceScope = ConvergenceScope> {
  readonly tenantId: TenantId;
  readonly scope: TScope;
  readonly scopeKey: ScopedStage<TScope>;
  readonly runId: ConvergenceRunId;
  readonly createdAt: string;
}

export type BrandedScopeInput<TScope extends ConvergenceScope> = RuntimeEnvelope<TScope> & {
  readonly kind: `scope:${TScope}`;
  readonly stageKeys: readonly ScopedStage<TScope>[];
};

export interface RuntimeRegistryEntry<TScope extends ConvergenceScope, TStage extends ConvergenceStage> {
  readonly id: `${TScope}/${TStage}/${string}`;
  readonly scope: TScope;
  readonly stage: TStage;
  readonly labels: readonly string[];
  readonly enabled: boolean;
}

export type NormalizeByScope<TEntries extends Record<string, RuntimeRegistryEntry<ConvergenceScope, ConvergenceStage>>> = {
  [K in keyof TEntries as TEntries[K]['scope']]: TEntries[K]
};

export type StageTuple<T extends readonly ConvergenceStage[]> = T extends readonly [infer THead, ...infer TTail]
  ? THead extends ConvergenceStage
    ? TTail extends readonly ConvergenceStage[]
      ? [THead, ...StageTuple<TTail>]
      : readonly []
    : readonly []
  : readonly [];

export type StagePayload<TInput extends ConvergenceInput> = {
  readonly baselineScope: ConvergenceScope;
  readonly runtimeScope: TInput['scope'];
  readonly constraints: readonly ConvergenceConstraint[];
  readonly summary: {
    readonly activeConstraints: number;
    readonly inputRun: TInput['runId'];
  };
};

export type StageDigest<T extends ConvergenceStage = ConvergenceStage> = `${T}-diagnostic`;
export type SignalPath<T extends string> = T extends `signal:${infer Name}` ? Name : T;
export type RuntimeMetricMap = Readonly<Record<string, number>>;

export type MergeMetrics<TLeft extends RuntimeMetricMap, TRight extends RuntimeMetricMap> = {
  [K in keyof TLeft | keyof TRight]:
    K extends keyof TLeft
      ? K extends keyof TRight
        ? number
        : TLeft[K & keyof TLeft]
      : K extends keyof TRight
        ? TRight[K]
        : never;
};

export type ConstraintBundle<TScope extends ConvergenceScope = ConvergenceScope> = {
  readonly scope: TScope;
  readonly constraints: readonly ConvergenceConstraint[];
  readonly count: number;
};

export const asRuntimeNode = (scope: ConvergenceScope, token: ConvergenceRunId): ConvergenceRuntimeNode =>
  `${scope}::${token}::node` as ConvergenceRuntimeNode;

export const asRuntimeToken = (scope: ConvergenceScope, stage: ConvergenceStage): ConvergenceRuntimeToken =>
  `${scope}/${stage}/${Date.now()}` as ConvergenceRuntimeToken;

const isConvergenceScope = (value: string): value is ConvergenceScope =>
  value === 'tenant' || value === 'topology' || value === 'signal' || value === 'policy' || value === 'fleet';

export const toConstraintBundle = <
  TScope extends ConvergenceScope,
>(constraints: readonly ConvergenceConstraint[], scope: TScope): ConstraintBundle<TScope> => {
  const normalized = [...constraints];
  return {
    scope,
    constraints: normalized,
    count: normalized.length,
  };
};

export const toStagePayload = <TInput extends ConvergenceInput>(
  input: TInput,
  constraints: readonly ConvergenceConstraint[] = [],
): StagePayload<TInput> => ({
  baselineScope: input.scope,
  runtimeScope: input.scope,
  constraints,
  summary: {
    activeConstraints: constraints.length,
    inputRun: input.runId,
  },
});

export const selectScopedEntries = <TEntries extends Record<string, RuntimeRegistryEntry<ConvergenceScope, ConvergenceStage>>>(
  entries: TEntries,
  scope: ConvergenceScope,
): readonly RuntimeRegistryEntry<ConvergenceScope, ConvergenceStage>[] =>
  Object.values(entries).filter((entry) => entry.scope === scope) as readonly RuntimeRegistryEntry<
    ConvergenceScope,
    ConvergenceStage
  >[];

export const keyByStage = <
  TScope extends ConvergenceScope,
  TEntries extends Record<string, RuntimeRegistryEntry<TScope, ConvergenceStage>>,
>(entries: TEntries): Record<ConvergenceStage, readonly PluginName<ScopedStage<TScope>, ConvergenceStage>[]> => {
  const buckets = {
    input: [] as PluginName<ScopedStage<TScope>, 'input'>[],
    resolve: [] as PluginName<ScopedStage<TScope>, 'resolve'>[],
    simulate: [] as PluginName<ScopedStage<TScope>, 'simulate'>[],
    recommend: [] as PluginName<ScopedStage<TScope>, 'recommend'>[],
    report: [] as PluginName<ScopedStage<TScope>, 'report'>[],
  } as Record<ConvergenceStage, readonly PluginName<ScopedStage<TScope>, ConvergenceStage>[]>;

  const output = { ...buckets };
  for (const entry of Object.values(entries) as ReadonlyArray<RuntimeRegistryEntry<ConvergenceScope, ConvergenceStage>>) {
    const key = entry.stage as ConvergenceStage;
    output[key] = [...output[key], `${entry.scope}-${key}-processor` as PluginName<ScopedStage<TScope>, ConvergenceStage>];
  }

  return output;
};

export const normalizeStageBundle = <TInput extends ConvergenceInput>(
  input: TInput,
  output: ConvergenceOutput<TInput['stage']>,
): Readonly<{
  readonly inputStage: TInput['stage'];
  readonly outputStage: ConvergenceOutput<TInput['stage']>['stage'];
  readonly scopeBundle: ConstraintBundle<TInput['scope']>;
}> => ({
  inputStage: input.stage,
  outputStage: output.stage,
  scopeBundle: output.selectedRunbooks.length
    ? toConstraintBundle([], input.scope)
    : toConstraintBundle(input.anchorConstraints, input.scope),
});

export const buildRuntimeEnvelope = <TScope extends ConvergenceScope>(
  tenantId: TenantId,
  scope: TScope,
): BrandedScopeInput<TScope> => ({
  tenantId,
  scope,
  scopeKey: `${scope}:input` as ScopedStage<TScope>,
  runId: `${tenantId}::${scope}::${Date.now()}` as ConvergenceRunId,
  createdAt: new Date().toISOString(),
  kind: `scope:${scope}` as const,
  stageKeys: [
    `${scope}:input`,
    `${scope}:resolve`,
    `${scope}:simulate`,
    `${scope}:recommend`,
    `${scope}:report`,
  ] as const,
});

export const inferStageKey = <TValue extends string>(value: TValue): StageFromScoped<TValue> => {
  const stage = value.split(':')[1] as ConvergenceStage;
  return stage as StageFromScoped<TValue>;
};

export const buildScopedRegistry = () => {
  const entries = {
    tenantInput: {
      id: 'tenant/input/registry',
      scope: 'tenant' as const,
      stage: 'input' as const,
      labels: ['bootstrap', 'index'],
      enabled: true,
    },
    tenantReport: {
      id: 'tenant/report/registry',
      scope: 'tenant' as const,
      stage: 'report' as const,
      labels: ['finalize'],
      enabled: true,
    },
    topologySimulate: {
      id: 'topology/simulate/registry',
      scope: 'topology' as const,
      stage: 'simulate' as const,
      labels: ['graph', 'stress'],
      enabled: true,
    },
    signalRecommend: {
      id: 'signal/recommend/registry',
      scope: 'signal' as const,
      stage: 'recommend' as const,
      labels: ['alerts'],
      enabled: true,
    },
    policyResolve: {
      id: 'policy/resolve/registry',
      scope: 'policy' as const,
      stage: 'resolve' as const,
      labels: ['checks'],
      enabled: true,
    },
    fleetInput: {
      id: 'fleet/input/registry',
      scope: 'fleet' as const,
      stage: 'input' as const,
      labels: ['fleet', 'start'],
      enabled: true,
    },
  } satisfies Record<string, RuntimeRegistryEntry<ConvergenceScope, ConvergenceStage>>;

  return entries;
};
