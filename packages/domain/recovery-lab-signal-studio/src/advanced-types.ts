import type { Brand, KeyPaths, NoInfer, PathValue } from '@shared/type-level';
import type {
  PluginCatalog,
  PluginContract,
  PluginExecutionOutput,
  PluginStage,
  PluginSpec,
} from '@shared/lab-simulation-kernel';

export type StudioTenantId = Brand<string, 'StudioTenantId'>;
export type StudioWorkspaceId = Brand<string, 'StudioWorkspaceId'>;
export type StudioScenarioId = Brand<string, 'StudioScenarioId'>;
export type StudioRunToken = Brand<string, 'StudioRunToken'>;
export type StudioPluginId = Brand<string, 'StudioPluginId'>;

export interface StudioContext {
  readonly tenant: StudioTenantId;
  readonly workspace: StudioWorkspaceId;
  readonly scenario: StudioScenarioId;
  readonly runId: StudioRunToken;
}

export interface PluginWindow {
  readonly start: number;
  readonly end: number;
  readonly values: readonly number[];
}

export interface PluginMetrics {
  readonly plugin: string;
  readonly stage: PluginStage;
  readonly latencyMs: number;
  readonly warnings: readonly string[];
}

export interface StudioPolicySpec {
  readonly id: string;
  readonly weight: number;
  readonly lane?: 'simulate' | 'verify' | 'restore' | 'recover';
  readonly tags?: readonly string[];
}

export interface StudioPolicyDefinition<TPayload = unknown> {
  readonly spec: PluginSpec<string, PluginStage, string>;
  readonly id: string;
  readonly stage: PluginStage;
  readonly policy: StudioPolicySpec;
  readonly run: (input: { readonly request: TPayload }) => Promise<PluginExecutionOutput<unknown>>;
}

export type Tenantized<T extends string> = T & StudioTenantId;
export type Workspaceized<T extends string> = T & StudioWorkspaceId;

export type StageBucketSignature<T extends string> = `${T}::bucket`;

export type StageFromTuple<T extends readonly PluginStage[]> =
  T extends readonly [infer Head extends PluginStage, ...infer Tail extends readonly PluginStage[]]
    ? readonly [Head, ...StageFromTuple<Tail>]
    : readonly [];

export const defaultStudioStages = ['detect', 'disrupt', 'verify', 'restore'] as const satisfies readonly PluginStage[];

export type KnownStage = typeof defaultStudioStages[number];

export interface SessionDescriptor {
  readonly tenant: string;
  readonly workspace: string;
  readonly runRef: string;
}

export interface PluginSignature {
  readonly label: string;
  readonly stage: PluginStage;
  readonly score: number;
}

export const normalizePluginLabel = (value: string): string => value.trim().toLowerCase();

export const normalizeRunId = (tenant: string, workspace: string, scenario: string): StudioRunToken =>
  `run:${normalizePluginLabel(tenant)}:${normalizePluginLabel(workspace)}:${normalizePluginLabel(scenario)}` as StudioRunToken;

export const normalizeTenantId = (tenant: string): StudioTenantId =>
  `tenant:${normalizePluginLabel(tenant)}` as StudioTenantId;

export const normalizeWorkspaceId = (workspace: string): StudioWorkspaceId =>
  `workspace:${normalizePluginLabel(workspace)}` as StudioWorkspaceId;

export const normalizeScenarioId = (scenario: string): StudioScenarioId =>
  `scenario:${normalizePluginLabel(scenario)}` as StudioScenarioId;

export type FlattenRoute<
  T extends readonly string[],
  D extends string = '/',
> = T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? `${Head}${D}${FlattenRoute<Tail, D>}`
  : '';

export type ReverseTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? readonly [...ReverseTuple<Tail & readonly unknown[]>, Head]
    : readonly [];

export type RecursiveWindowSamples<T extends readonly number[]> =
  T extends readonly [infer Head extends number, ...infer Tail extends readonly number[]]
    ? readonly [Head, ...RecursiveWindowSamples<Tail>]
    : readonly [];

export type PluginRoute<T extends readonly string[]> =
  T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? Tail extends readonly []
      ? Head
      : `${Head}:${PluginRoute<Tail>}`
    : never;

export type PluginNameParts<TName extends string> =
  TName extends `${infer Namespace}.${infer Plugin}@${infer Version}`
    ? {
        readonly namespace: Namespace;
        readonly plugin: Plugin;
        readonly version: Version;
      }
    : {
        readonly namespace: 'recovery';
        readonly plugin: TName;
        readonly version: '1.0.0';
      };

export type StudioCatalogByStage<TCatalog extends PluginCatalog, Stage extends PluginStage> =
  Extract<TCatalog[number], { readonly stage: Stage }>;

export type CatalogByStageBuckets<TCatalog extends PluginCatalog> = {
  [Stage in PluginStage as `${Stage}Plugins`]: readonly StudioCatalogByStage<TCatalog, Stage>[];
};

export type PluginOutputByName<TCatalog extends PluginCatalog> = {
  [K in TCatalog[number] as K['name'] & string]: K extends PluginContract<
    K['name'],
    any,
    infer TPayload,
    any
  >
    ? PluginExecutionOutput<TPayload>
    : never;
};

export type PluginInputByName<TCatalog extends PluginCatalog> = {
  [K in TCatalog[number] as K['name'] & string]: K extends PluginContract<
    K['name'],
    infer TInput,
    any,
    any
  >
    ? TInput
    : never;
};

export type PluginByName<TCatalog extends PluginCatalog> = {
  [K in TCatalog[number] as K['name'] & string]: K;
};

export type DeepPluginSignature<TCatalog extends PluginCatalog> = {
  readonly tenant: StudioTenantId;
  readonly stageCount: Readonly<{ [K in TCatalog[number] as K['stage']]: number }>;
  readonly pluginNames: PluginByName<TCatalog>;
};

export type StageSummary<TCatalog extends PluginCatalog> = {
  readonly [K in PluginStage]: {
    readonly count: number;
    readonly pluginIds: readonly (StudioCatalogByStage<TCatalog, K>['name'] & string)[];
    readonly route: readonly StageBucketSignature<K>[];
  };
};

export type WithCatalog<T extends PluginCatalog> = {
  readonly catalog: T;
  readonly routeHint: PluginRoute<[T[number]['name'] & string, 'pipeline']>;
};

export type PipelineTemplate<T extends readonly PluginStage[]> = {
  readonly stages: StageFromTuple<T>;
  readonly signature: PluginRoute<T>;
  readonly reversed: ReverseTuple<T>;
};

export const routeForWindow = (window: PluginWindow): string => `${window.start}-${window.end}`;

export const buildTemplateFingerprint = (parts: readonly string[]): string => parts.join('|');

export const buildCatalogFingerprint = (catalog: PluginCatalog): string =>
  catalog
    .map((plugin) => `${plugin.name}@${plugin.spec.version}`)
    .toSorted((left, right) => `${left}`.localeCompare(`${right}`))
    .join('::');

export const buildStageFingerprint = (stages: readonly PluginStage[]): string =>
  stages.map((stage) => `${stage}`).toSorted().join(':');

export const toSignature = (context: StudioContext): string =>
  `${context.tenant}/${context.workspace}/${context.scenario}:${context.runId}`;

export const pickStageEntries = <TRecord extends Record<string, unknown>, TPrefix extends string>(
  record: TRecord,
  prefix: TPrefix,
): readonly [string, unknown][] => {
  const entries: [string, unknown][] = [];
  for (const path of Object.keys(record) as Array<keyof TRecord & string>) {
    entries.push([`${prefix}.${path}`, record[path]]);
  }
  return entries;
};

export const flattenPaths = <TRecord extends Record<string, unknown>>(
  record: TRecord,
): readonly KeyPaths<TRecord>[] =>
  Object.keys(record) as unknown as readonly KeyPaths<TRecord>[];

export const valueAtPath = <TRecord extends Record<string, unknown>, TPath extends keyof TRecord & string>(
  record: TRecord,
  path: TPath,
): PathValue<TRecord, TPath> => record[path] as PathValue<TRecord, TPath>;

export const normalizeMetricWindow = (window: PluginWindow): PluginWindow => {
  if (window.values.length === 0) {
    return { start: window.start, end: window.end, values: [0] };
  }
  return {
    ...window,
    values: [...window.values].toSorted((left, right) => left - right),
  };
};

export const mergeMetrics = (left: readonly PluginMetrics[], right: readonly PluginMetrics[]): readonly PluginMetrics[] => {
  const byPlugin = new Map<string, number>();
  const merged: PluginMetrics[] = [];

  for (const metric of [...left, ...right]) {
    byPlugin.set(metric.plugin, (byPlugin.get(metric.plugin) ?? 0) + metric.latencyMs);
  }
  for (const [plugin, latencyMs] of byPlugin.entries()) {
    merged.push({
      plugin,
      stage: 'detect',
      latencyMs,
      warnings: [],
    });
  }
  return merged.toSorted((leftMetric, rightMetric) => rightMetric.latencyMs - leftMetric.latencyMs);
};

export const normalizeWindowValues = <TValues extends readonly number[]>(values: NoInfer<TValues>): RecursiveWindowSamples<TValues> => {
  const asTuple = values.length === 0
    ? ([] as const)
    : ([...values] as unknown as TValues);
  return asTuple as unknown as RecursiveWindowSamples<TValues>;
};

export const resolveContext = (tenant: string, workspace: string, scenario: string): StudioContext => ({
  tenant: normalizeTenantId(tenant),
  workspace: normalizeWorkspaceId(workspace),
  scenario: normalizeScenarioId(scenario),
  runId: normalizeRunId(tenant, workspace, scenario),
});

export const policyList = (policies: readonly StudioPolicySpec[]): readonly StudioPolicySpec[] =>
  policies.toSorted((left, right) => right.weight - left.weight);

export const policyByRoute = <TPolicy extends StudioPolicySpec>(
  policies: readonly TPolicy[],
): Record<string, readonly TPolicy[]> => {
  const grouped: Record<string, TPolicy[]> = {};
  for (const policy of policies) {
    const bucket = grouped[policy.lane ?? 'simulate'] ?? [];
    bucket.push(policy);
    grouped[policy.lane ?? 'simulate'] = bucket;
  }
  return grouped;
};

export interface SessionCommand<TCatalog extends PluginCatalog> {
  readonly tenant: StudioTenantId;
  readonly workspace: StudioWorkspaceId;
  readonly scenario: StudioScenarioId;
  readonly catalog: NoInfer<TCatalog>;
  readonly policies: readonly StudioPolicySpec[];
}
