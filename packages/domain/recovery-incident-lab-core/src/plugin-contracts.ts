import { z } from 'zod';
import { Brand, withBrand } from '@shared/core';
import type { JsonValue, NoInfer } from '@shared/type-level';

export const pluginKinds = ['telemetry', 'policy', 'simulation', 'workflow', 'adapter', 'coordinator', 'safety'] as const;
export type PluginKind = (typeof pluginKinds)[number];

export const pluginStages = ['bootstrap', 'prepare', 'execute', 'observe', 'assess', 'remediate', 'archive'] as const;
export type PluginStage = (typeof pluginStages)[number];

export type PluginVersion = `${number}.${number}.${number}`;
export type PluginNamespace = Brand<string, 'PluginNamespace'>;
export type PluginManifestId = Brand<string, 'PluginManifestId'>;
export type PluginRoute = Brand<string, 'PluginRoute'>;
export type PluginRunId = Brand<string, 'PluginRunId'>;
export type PluginTag = Brand<string, `plugin-tag:${string}`>;
export type PluginExecutionState = 'idle' | 'warming' | 'running' | 'suspended' | 'done' | 'failed' | 'stopped';

export type PluginSpecPath<T extends string> = T extends `${infer Head}/${infer Tail}` ? readonly [Head, ...PluginSpecPath<Tail>] : readonly [T];
export type PluginVersionParts<T extends PluginVersion> = T extends `${infer Major}.${infer Minor}.${infer Patch}`
  ? readonly [Major, Minor, Patch]
  : readonly ['0', '0', '0'];
export type PluginSpecDepth<T extends string> = PluginSpecPath<T>['length'];

export type RecursivePluginTuple<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail extends readonly unknown[],
]
  ? readonly [Head, ...RecursivePluginTuple<Tail>]
  : readonly [];

export const pluginLifecycleEvents = ['manifest:loaded', 'manifest:validated', 'run:started', 'run:finished', 'run:errored', 'run:stopped'] as const;
export type PluginLifecycleEventType = (typeof pluginLifecycleEvents)[number];

export interface TelemetryCapability {
  readonly kind: 'telemetry';
  readonly sampling: number;
  readonly emits: readonly ['metric', string][];
}

export interface PolicyCapability {
  readonly kind: 'policy';
  readonly rules: readonly {
    readonly ruleId: string;
    readonly expression: string;
  }[];
}

export interface SimulationCapability {
  readonly kind: 'simulation';
  readonly model: string;
  readonly confidence: number;
  readonly iterations: number;
}

export interface WorkflowCapability {
  readonly kind: 'workflow';
  readonly stages: readonly PluginStage[];
  readonly timeoutMs: number;
}

export interface AdapterCapability {
  readonly kind: 'adapter';
  readonly endpoints: readonly PluginKind[];
  readonly timeoutMs: number;
}

export interface CoordinatorCapability {
  readonly kind: 'coordinator';
  readonly quorum: number;
  readonly allowParallel: boolean;
}

export interface SafetyCapability {
  readonly kind: 'safety';
  readonly breakOn: readonly ['error' | 'warning', number][];
  readonly fallback: 'reject' | 'skip';
}

export type PluginCapabilitySpec<C extends PluginKind = PluginKind> = C extends 'telemetry'
  ? TelemetryCapability
  : C extends 'policy'
    ? PolicyCapability
    : C extends 'simulation'
      ? SimulationCapability
      : C extends 'workflow'
        ? WorkflowCapability
        : C extends 'adapter'
          ? AdapterCapability
          : C extends 'coordinator'
            ? CoordinatorCapability
            : C extends 'safety'
              ? SafetyCapability
              : never;

export type TaggedPluginEvents<TManifest extends PluginManifest> = {
  [K in TManifest['kind'] as `event:${K}`]: {
    readonly manifestId: TManifest['id'];
    readonly route: TManifest['route'];
    readonly at: string;
  };
};

export interface PluginDependency {
  readonly targetManifestId: PluginManifestId;
  readonly mode: 'hard' | 'soft' | 'retryable';
}

export interface PluginManifestCore<TKind extends PluginKind = PluginKind> {
  readonly id: PluginManifestId;
  readonly namespace: PluginNamespace;
  readonly kind: TKind;
  readonly route: PluginRoute;
  readonly version: PluginVersion;
  readonly title: string;
  readonly tags: readonly PluginTag[];
  readonly states: readonly PluginExecutionState[];
  readonly dependencies: readonly PluginDependency[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly enabled: boolean;
}

export interface PluginManifest<
  TKind extends PluginKind = PluginKind,
  TConfig extends Record<string, JsonValue> = Record<string, JsonValue>,
  TRoute extends string = string,
> extends PluginManifestCore<TKind> {
  readonly route: Brand<`/recovery/${TRoute}`, 'PluginRoute'>;
  readonly config: TConfig & PluginCapabilitySpec<TKind>;
  readonly runId: PluginRunId;
  readonly capabilities: PluginCapabilitySpec<TKind>[];
}

export interface PluginEnvelope<TKind extends PluginKind = PluginKind> {
  readonly manifest: PluginManifest<TKind>;
  readonly events: readonly PluginLifecycleRecord[];
}

export type PluginLifecycleRecord = {
  readonly type: PluginLifecycleEventType;
  readonly at: string;
  readonly manifestId: PluginManifestId;
  readonly message: string;
};

export type CapabilityMap<T extends readonly PluginManifest[]> = {
  [M in T[number] as M['kind']]: {
    readonly manifestId: M['id'];
    readonly namespace: M['namespace'];
    readonly route: M['route'];
  }[];
};

const manifestKindSchema = z.enum(pluginKinds as readonly [PluginKind, ...PluginKind[]]);
const stateSchema = z.enum([...pluginLifecycleEvents] as readonly [PluginLifecycleEventType, ...PluginLifecycleEventType[]]);
const runIdSchema = z.string().uuid();
const routeSchema = z
  .string()
  .trim()
  .refine((value) => value.startsWith('/recovery/'), { message: 'route must start with /recovery/' });
const tagsSchema = z.array(z.string().min(2));
const capabilitySchema = z.object({
  kind: z.literal('telemetry').or(z.literal('policy')).or(z.literal('simulation')).or(z.literal('workflow')).or(z.literal('adapter')).or(z.literal('coordinator')).or(z.literal('safety')),
  sampling: z.number().min(0).max(1).optional(),
  emits: z.array(z.tuple([z.string(), z.string()])),
  rules: z.array(z.object({ ruleId: z.string(), expression: z.string() })).optional(),
  model: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
  iterations: z.number().min(1).max(10_000).optional(),
  stages: z.array(z.string()).optional(),
  timeoutMs: z.number().min(0).max(120_000).optional(),
  endpoints: z.array(z.string()).optional(),
  quorum: z.number().min(1).max(100).optional(),
  allowParallel: z.boolean().optional(),
  breakOn: z.array(z.tuple([z.union([z.literal('error'), z.literal('warning')]), z.number()])).optional(),
  fallback: z.union([z.literal('reject'), z.literal('skip')]).optional(),
});
const manifestConfig = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.unknown()), z.array(z.unknown())]),
);
const manifestDependencies = z.array(
  z.object({
    targetManifestId: z.string(),
    mode: z.union([z.literal('hard'), z.literal('soft'), z.literal('retryable')]),
  }),
);

const manifestSchema = z.object({
  namespace: z.string().min(1),
  kind: manifestKindSchema,
  route: routeSchema,
  version: z.string(),
  title: z.string().min(1),
  tags: tagsSchema,
  states: stateSchema.array(),
  dependencies: manifestDependencies,
  config: manifestConfig,
  enabled: z.boolean(),
  runId: runIdSchema,
  capabilities: z.array(capabilitySchema).min(1),
});

const createRoute = (namespace: string, kind: PluginKind, stage: PluginStage): PluginRoute =>
  withBrand(`/recovery/${namespace}/${kind}/${stage}`, 'PluginRoute');

export const buildPluginId = (namespace: string, kind: PluginKind): PluginManifestId =>
  withBrand(`${namespace}:${kind}:${Date.now()}`, 'PluginManifestId');

export const buildPluginTag = (kind: PluginKind, label: string): PluginTag =>
  withBrand(`plugin:${kind}:${label}`, `plugin-tag:${kind}`);

export const buildPluginRouteFingerprint = (kind: PluginKind, route: PluginRoute): Brand<string, 'PluginRouteFingerprint'> =>
  withBrand(`${kind}:${route}`, 'PluginRouteFingerprint');

const bootstrapState = ['idle', 'warming', 'running', 'done', 'stopped'] as const satisfies readonly PluginExecutionState[];

export const defaultPluginManifest = <
  TKind extends PluginKind,
  TConfig extends Record<string, JsonValue> = Record<string, JsonValue>,
  TRoute extends string = 'bootstrap',
>(
  input: {
    readonly kind: NoInfer<TKind>;
    readonly namespace: string;
    readonly title: string;
    readonly route: TRoute;
    readonly version: PluginVersion;
    readonly tags: RecursivePluginTuple<readonly PluginTag[]>;
    readonly config: TConfig & PluginCapabilitySpec<TKind>;
    readonly dependencies: readonly PluginDependency[];
  },
): PluginManifest<TKind, TConfig, TRoute> => {
  const now = new Date().toISOString();
  const route = createRoute(input.namespace, input.kind, input.route.split('/')[0] as PluginStage);

  return {
    id: buildPluginId(input.namespace, input.kind),
    namespace: withBrand(input.namespace, 'PluginNamespace'),
    kind: input.kind,
    route: route as PluginManifest<TKind, TConfig, TRoute>['route'],
    title: input.title,
    version: input.version,
    tags: input.tags.map((tag) => tag),
    states: bootstrapState,
    dependencies: input.dependencies,
    createdAt: now,
    updatedAt: now,
    enabled: true,
    config: input.config,
    runId: withBrand(`${input.namespace}:${input.title}:${input.version}`, 'PluginRunId'),
    capabilities: [input.config as PluginCapabilitySpec<TKind>],
  };
};

export const pluginInputKinds = [...pluginKinds] satisfies readonly PluginKind[];

export const manifestParseResult = <TKind extends PluginKind, TConfig extends Record<string, JsonValue>>(
  input: unknown,
): PluginManifest<TKind, TConfig> => {
  const parsed = manifestSchema.parse(input) as unknown as Omit<
    PluginManifest<TKind, TConfig>,
    'route' | 'config' | 'capabilities'
  > & {
    readonly route: string;
    readonly config: Record<string, JsonValue>;
    readonly capabilities: Record<string, JsonValue>[];
  };

  const parsedCapabilities = parsed.capabilities.map(
    (entry) => entry as unknown as PluginCapabilitySpec<TKind>,
  );

  return {
    ...parsed,
    route: createRoute(parsed.namespace, parsed.kind as TKind, pluginStages[0]),
    config: (parsed.config as unknown) as TConfig & PluginCapabilitySpec<TKind>,
    runId: withBrand(`${parsed.namespace}:${parsed.title}:${parsed.version}`, 'PluginRunId'),
    capabilities: parsedCapabilities,
  } as unknown as PluginManifest<TKind, TConfig>;
};

export const toManifestEnvelope = <TKind extends PluginKind>(
  manifest: PluginManifest<TKind>,
  events: readonly PluginLifecycleRecord[],
): PluginEnvelope<TKind> => ({
  manifest,
  events,
});
