import { NoInfer, mapWithIteratorHelpers, type JsonValue } from '@shared/type-level';
import {
  asNamespace,
  asRun,
  asTenant,
  asWindow,
} from '../identifiers';
import type {
  PluginNode,
  PluginRouteSignature,
  PluginRunInput,
  PluginRunResult,
  PluginRunContext,
} from '../typed-plugin-types';
import { toPluginTraceId } from '../typed-plugin-types';

export type JourneyToken<T extends string = string> = `journey:${T}`;
export type JourneyTag<T extends string = string> = `tag:${T}`;
export type JourneyMetric = 'latency' | 'coverage' | 'entropy' | 'confidence';
export type BrandedJourneyId<T extends string> = `${T}` & { __brand: 'RecoveryJourneyId' };
export type JourneyStage<TName extends string = string> = `stage:${TName}`;

type JourneyPayload<TInput = JsonValue> = {
  readonly signal: PluginRunContext;
  readonly payload: TInput;
};

export type PluginDependencyMap<T extends readonly PluginNode[]> = {
  readonly [K in T[number] as K['name']]: K['dependsOn'];
};

export type PluginOutputKindMap<T extends readonly PluginNode[]> = {
  readonly [K in T[number] as K['name']]: K['outputKinds'][number];
};

export type PluginInputKindMap<T extends readonly PluginNode[]> = {
  readonly [K in T[number] as K['name']]: K['inputKinds'][number];
};

export type ExpandPluginNames<T extends readonly PluginNode[]> = {
  readonly [K in T[number]['name']]: K;
};

export type RecursiveJoin<T extends readonly string[], TSep extends string = '/'> =
  T extends readonly [infer H extends string, ...infer R extends readonly string[]]
    ? `${H}${R['length'] extends 0 ? '' : TSep}${RecursiveJoin<R, TSep>}`
    : '';

export type PathTokens<TInput extends string> =
  TInput extends `${infer Head}/${infer Rest}`
    ? readonly [Head, ...PathTokens<Rest>]
    : readonly [TInput];

export type PluginRouteShape<TPlugins extends readonly PluginNode[]> = {
  readonly [K in keyof TPlugins]: TPlugins[K] extends PluginNode ? TPlugins[K]['name'] : never;
};

export type JourneySignature<TPlugins extends readonly PluginNode[]> = PluginRouteSignature<TPlugins>;

export type NormalizedInput<TSignal extends string> =
  TSignal extends `signal:${infer TPayload}` ? TPayload : TSignal;

export type BrandInput<TInput extends string> = `${TInput}` & { __brand: 'JourneyInput' };

export interface JourneyEnvelope<
  TInput extends string = string,
  TState extends PluginRunContext = PluginRunContext,
  TPayload = unknown,
> {
  readonly id: BrandedJourneyId<JourneyToken<TInput>>;
  readonly tenant: ReturnType<typeof asTenant>;
  readonly namespace: ReturnType<typeof asNamespace>;
  readonly state: TState;
  readonly runId: BrandInput<TInput>;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export interface JourneyExecution<TPlugins extends readonly PluginNode[]> {
  readonly id: string;
  readonly plugins: TPlugins;
  readonly signature: JourneySignature<TPlugins>;
  readonly tags: readonly JourneyTag[];
  readonly topology: readonly JourneyToken[];
  readonly metrics: {
    readonly latencyMs: number;
    readonly warningCount: number;
  };
}

export interface JourneyStepResult<T extends PluginRunResult = PluginRunResult> {
  readonly plugin: T['plugin'];
  readonly accepted: T['accepted'];
  readonly signalCount: T['signalCount'];
  readonly latencyMs: number;
}

const dedupeSignals = (signals: readonly string[]): readonly string[] => [...new Set(signals)];

export const normalizeJourneySignal = (input: string): `signal:${string}` => {
  const lowered = input.toLowerCase();
  return lowered.startsWith('signal:')
    ? (lowered as `signal:${string}`)
    : (`signal:${lowered}` as `signal:${string}`);
};

export const buildJourneySignature = (seed: string): JourneySignature<readonly PluginNode[]> =>
  `route:${normalizeJourneySignal(seed).replace('signal:', '')}` as JourneySignature<readonly PluginNode[]>;

export const describeJourney = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
): JourneyExecution<TPlugins> => {
  const seed = asNamespace('namespace:journey');
  const runId = asRun(`journey:${Date.now()}`);
  const topology = mapWithIteratorHelpers(plugins, (entry) => `journey:${entry.name}` as JourneyToken);
  const signature = buildJourneySignature(seed) as JourneySignature<TPlugins>;

  return {
    id: runId,
    plugins,
    signature,
    tags: mapWithIteratorHelpers(topology, (entry) => `tag:${entry}` as JourneyTag),
    topology,
    metrics: {
      latencyMs: topology.length * 11,
      warningCount: topology.filter((entry) => entry.includes('catalog')).length,
    },
  };
};

export const buildInputEnvelope = <TPlugins extends readonly PluginNode[]>(
  input: PluginRunInput,
  plugins: TPlugins,
): {
  readonly envelope: JourneyEnvelope<string, PluginRunContext, JsonValue>;
  readonly dependencies: PluginDependencyMap<TPlugins>;
  readonly outputs: PluginOutputKindMap<TPlugins>;
} => {
  const route = mapWithIteratorHelpers(plugins, (plugin) => plugin.name);
  const signature = buildJourneySignature(route.join('::'));
  const baseContext = {
    tenant: asTenant(`tenant:${input.runId.replace('run:', '')}`),
    namespace: asNamespace(input.namespace),
    window: asWindow('window:journey'),
    runId: asRun(`journey:${Date.now()}`),
    trace: toPluginTraceId(input.runId),
  };
  const envelope: JourneyEnvelope<string, PluginRunContext, JsonValue> = {
    id: (`journey:${signature}` as BrandedJourneyId<JourneyToken<string>>),
    tenant: asTenant(`tenant:${input.runId.replace('run:', '')}`),
    namespace: asNamespace(input.namespace),
    state: baseContext,
    runId: (`journey:${input.runId}` as BrandInput<string>),
    payload: {
      signal: baseContext,
      payload: input.payload,
    },
    createdAt: new Date().toISOString(),
  };
  return {
    envelope,
    dependencies: {} as PluginDependencyMap<TPlugins>,
    outputs: {} as PluginOutputKindMap<TPlugins>,
  };
};

export const summarizePluginOutputs = (results: readonly PluginRunResult[]): {
  readonly accepted: number;
  readonly rejected: number;
  readonly signalCount: number;
  readonly byPlugin: Readonly<Record<string, number>>;
} => {
  const byPlugin: Record<string, number> = {};
  for (const result of results) {
    byPlugin[result.plugin] = (byPlugin[result.plugin] ?? 0) + result.signalCount;
  }
  const totalSignalCount = results.reduce((acc, entry) => acc + entry.signalCount, 0);
  return {
    accepted: results.filter((entry) => entry.accepted).length,
    rejected: results.length - results.filter((entry) => entry.accepted).length,
    signalCount: totalSignalCount,
    byPlugin,
  };
};

export const mergeSignalTokens = (left: readonly string[], right: readonly string[]): readonly string[] =>
  dedupeSignals([...left, ...right]);

export const buildJourneyTrace = <TPlugins extends readonly PluginNode[]>(
  inputs: readonly string[],
  plugins: NoInfer<TPlugins>,
): readonly JourneyToken[] => {
  const prefix = buildJourneySignature(inputs.join(':'));
  return mapWithIteratorHelpers(plugins, (plugin, index) => `${prefix}-${plugin.name}-${index}` as JourneyToken);
};

export const buildJourneySteps = <TPlugins extends readonly PluginNode[]>(
  plugins: NoInfer<TPlugins>,
): readonly JourneyStepResult[] => {
  return mapWithIteratorHelpers(plugins, (plugin, index) => ({
    plugin: pluginName(plugin),
    accepted: index % 2 === 0,
    signalCount: Math.max(1, plugin.weight),
    latencyMs: index * 7,
  }));
};

const pluginName = (plugin: PluginNode): PluginNode['name'] => plugin.name;
