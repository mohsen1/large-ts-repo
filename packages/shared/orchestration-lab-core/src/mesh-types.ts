import { z } from 'zod';
import {
  type Brand,
  type IncidentSeverity,
  type RecoverySignal,
  type SignalId,
  type TenantId,
  type TemporalWindow,
  severityWeightLookup,
} from './type-system';
import {
  canonicalizeNamespace,
  type PluginContext,
  type PluginDefinition,
  type PluginDependency,
  type PluginId,
  type PluginKind,
  type PluginVersion,
  buildPluginId,
} from '@shared/stress-lab-runtime';

type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type MeshLane = 'signal' | 'topology' | 'policy' | 'safety' | 'simulation';
export type MeshMode = 'discovery' | 'control' | 'simulation' | 'policy-what-if';
export type MeshKind<TLane extends MeshLane = MeshLane> = `mesh/${TLane}`;
export type MeshRuntimeState = 'idle' | 'warming' | 'executing' | 'aborting' | 'complete' | 'failed';
export type MeshDependency = `mesh:dep:${string}`;
export type MeshMetricName =
  | `mesh.${MeshLane}.latency`
  | `mesh.${MeshLane}.errorRate`
  | `mesh.${MeshLane}.throughput`
  | `mesh.${MeshLane}.health`
  | `mesh/${MeshLane}/${MeshMode}.latency`
  | `mesh/${MeshLane}/${MeshMode}.errorRate`
  | `mesh/${MeshLane}/${MeshMode}.throughput`
  | `mesh/${MeshLane}/${MeshMode}.health`;

export type MeshRunId = Brand<string, 'MeshRunId'>;
export type MeshTenantId = Brand<string, 'MeshTenantId'>;
export type MeshPluginFingerprint = Brand<string, 'MeshPluginFingerprint'>;
export type MeshConstraintId = Brand<string, 'MeshConstraintId'>;

export type MeshPath<
  TParts extends readonly string[] = readonly string[],
> = TParts extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? `${Head}${Tail extends readonly [] ? '' : `/${JoinedMeshPath<Tail>}`}`
  : never;

export type JoinedMeshPath<TParts extends readonly string[]> = TParts extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? Tail extends readonly [string, ...string[]]
    ? `${Head}/${JoinedMeshPath<Tail>}`
    : Head
  : never;

export type MeshPathParts<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...MeshPathParts<Tail>]
  : readonly [T];

export type MeshTemplateKey<TRoute extends string> = TRoute extends `${infer Left}/${infer Right}`
  ? `${Left}:${MeshTemplateKey<Right>}`
  : TRoute;

export type PluginByKind<TCatalog extends readonly PluginDefinition[]> = {
  [K in TCatalog[number]['kind']]: Extract<TCatalog[number], { readonly kind: K }>;
};

export type PluginInputOf<TPlugin extends PluginDefinition> = TPlugin extends PluginDefinition<infer TInput, any, any, any>
  ? TInput
  : never;

export type PluginOutputOf<TPlugin extends PluginDefinition> = TPlugin extends PluginDefinition<any, infer TOutput, any, any>
  ? TOutput
  : never;

export type MeshInputForChain<TChain extends readonly PluginDefinition[]> =
  TChain extends readonly [infer First, ...readonly unknown[]]
    ? First extends { readonly run: (context: PluginContext<Record<string, unknown>>, input: infer TInput, ...args: readonly unknown[]) => Promise<any> }
      ? TInput
      : never
    : never;

export type MeshOutputForChain<TChain extends readonly PluginDefinition[]> =
  TChain extends readonly [...any[], infer Last]
    ? Last extends PluginDefinition<any, infer TOutput, any, any>
      ? TOutput
      : never
    : never;

export interface MeshConstraint {
  readonly id: MeshConstraintId;
  readonly lane: MeshLane;
  readonly code: `${MeshLane}::${string}`;
  readonly severity: IncidentSeverity;
  readonly weight: number;
  readonly enabled: boolean;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface MeshManifest {
  readonly version: PluginVersion;
  readonly namespace: string;
  readonly activeLane: MeshLane;
  readonly activeMode: MeshMode;
  readonly pluginCount: number;
  readonly tags: readonly string[];
  readonly constraints: readonly MeshConstraint[];
}

export type MeshDigest = `${MeshLane}:${string}:${number}`;

export const buildMeshFingerprint = <TParts extends readonly string[] | readonly number[]>(parts: TParts): string =>
  parts
    .map((entry) => String(entry))
    .map((entry) => entry.trim().toLowerCase().replace(/\s+/g, '-'))
    .toSorted()
    .join('::');

const resolveNamespaceParts = <TSource extends string>(source: TSource): readonly string[] =>
  source.split(/[:/]/).filter((entry) => entry.length > 0);

export const buildMeshDigest = (manifest: MeshManifest, namespace?: string): MeshDigest => {
  const digest = buildMeshFingerprint([
    resolveNamespaceParts(namespace ?? manifest.namespace).join('-'),
    manifest.activeLane,
    manifest.activeMode,
    String(manifest.pluginCount),
  ]);
  return `${manifest.activeLane}:${digest}:${manifest.constraints.length}` as MeshDigest;
};

export interface MeshRunSeed {
  readonly tenantId: TenantId;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly selectedSignals: readonly SignalId[];
  readonly window: TemporalWindow;
  readonly context: Record<string, unknown>;
  readonly source: string;
}

export interface MeshRunEnvelope {
  readonly runId: MeshRunId;
  readonly tenantId: MeshTenantId;
  readonly mode: MeshMode;
  readonly route: MeshPath<[MeshKind, string, MeshMode]>;
  readonly startedAt: string;
  readonly constraints: readonly MeshConstraint[];
}

export interface MeshRunOutput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly runId: MeshRunId;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly stage: MeshRuntimeState;
  readonly score: number;
  readonly confidence: number;
  readonly signals: readonly SignalId[];
  readonly payload: TPayload;
  readonly telemetry: {
    readonly checksum: MeshPluginFingerprint;
    readonly latencyMs: number;
    readonly events: readonly MeshRuntimeEvent[];
  };
}

export interface MeshRuntimeEvent {
  readonly kind: MeshMetricName;
  readonly value: number;
  readonly at: string;
  readonly tags: readonly string[];
}

export type MeshRuntimeContext<TConfig extends Record<string, unknown> = Record<string, unknown>> = PluginContext<TConfig> & {
  readonly runId: MeshRunId;
  readonly meshLane: MeshLane;
  readonly meshMode: MeshMode;
  readonly stage: MeshRuntimeState;
};

export const toMeshTenantId = (tenantId: string): MeshTenantId => tenantId as MeshTenantId;
export const toMeshRunId = (tenantId: TenantId, seed: string): MeshRunId => `${tenantId}::${seed}::mesh` as MeshRunId;
export const toMeshDependency = (id: string): MeshDependency => `mesh:dep:${id}` as MeshDependency;
export const toMeshPluginFingerprint = (value: string): MeshPluginFingerprint => value as MeshPluginFingerprint;

const laneSchema = z.enum(['signal', 'topology', 'policy', 'safety', 'simulation']);
const modeSchema = z.enum(['discovery', 'control', 'simulation', 'policy-what-if']);

const constraintSchema = z.object({
  id: z.string(),
  lane: laneSchema,
  code: z.string(),
  severity: z.enum(['critical', 'high', 'moderate', 'low']),
  weight: z.number().min(0).max(1),
  enabled: z.boolean().default(true),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

const manifestSchema = z.object({
  namespace: z.string().min(3),
  activeLane: laneSchema,
  activeMode: modeSchema,
  pluginCount: z.number().int().min(0),
  tags: z.array(z.string()),
  constraints: z.array(constraintSchema),
});

const seedSchema = z.object({
  tenantId: z.string().min(3),
  lane: laneSchema,
  mode: modeSchema,
  selectedSignals: z.array(z.string()).default([]),
  window: z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
  }),
  context: z.record(z.unknown()).default({}),
  source: z.string().default('ui'),
});

export const parseMeshSeed = (value: unknown): MeshRunSeed => {
  const parsed = seedSchema.parse(value);
  return {
    tenantId: parsed.tenantId as TenantId,
    lane: parsed.lane,
    mode: parsed.mode,
    selectedSignals: parsed.selectedSignals as SignalId[],
    window: {
      from: parsed.window.from,
      to: parsed.window.to,
      timezone: parsed.window.timezone,
    },
    context: parsed.context,
    source: parsed.source,
  };
};

export const parseMeshManifest = (value: unknown): MeshManifest => {
  const parsed = manifestSchema.parse(value);
  return {
    version: '1.0.0',
    namespace: parsed.namespace,
    activeLane: parsed.activeLane,
    activeMode: parsed.activeMode,
    pluginCount: parsed.pluginCount,
    tags: parsed.tags,
    constraints: parsed.constraints.map((constraint: z.infer<typeof constraintSchema>) => ({
      ...constraint,
      id: `${constraint.lane}::${constraint.code}::${constraint.id}` as MeshConstraintId,
      metadata: constraint.metadata,
      code: `${constraint.lane}::${constraint.code}` as MeshConstraint['code'],
      severity: constraint.severity,
      weight: constraint.weight,
      enabled: constraint.enabled,
    })),
  };
};

export const parseMeshConstraint = (value: unknown): MeshConstraint => {
  const parsed = constraintSchema.parse(value);
  return {
    id: `${parsed.lane}::${parsed.id}` as MeshConstraintId,
    lane: parsed.lane,
    code: `${parsed.lane}::${parsed.code}` as `${MeshLane}::${string}`,
    severity: parsed.severity,
    weight: parsed.weight,
    enabled: parsed.enabled,
    metadata: parsed.metadata,
  } satisfies MeshConstraint;
};

const pluginBlueprints = [
  {
    namespace: 'recovery:mesh:signal',
    lane: 'signal',
    mode: 'discovery',
    pluginCount: 9,
    tags: ['signal', 'realtime', 'seed'],
    constraints: [{
      id: 'sig-latency',
      lane: 'signal',
      code: 'latency',
      severity: 'high',
      weight: 0.8,
      enabled: true,
      metadata: { source: 'ingestion', threshold: 0.75 },
    }],
  },
  {
    namespace: 'recovery:mesh:topology',
    lane: 'topology',
    mode: 'control',
    pluginCount: 12,
    tags: ['topology', 'planner', 'seed'],
    constraints: [{
      id: 'topo-spread',
      lane: 'topology',
      code: 'fanout',
      severity: 'moderate',
      weight: 0.5,
      enabled: true,
      metadata: { source: 'mesh-graph', threshold: 0.6 },
    }],
  },
  {
    namespace: 'recovery:mesh:policy',
    lane: 'policy',
    mode: 'control',
    pluginCount: 6,
    tags: ['policy', 'compliance', 'seed'],
    constraints: [{
      id: 'policy-quorum',
      lane: 'policy',
      code: 'quota',
      severity: 'critical',
      weight: 0.9,
      enabled: true,
      metadata: { source: 'policy', allowOverride: false },
    }],
  },
  {
    namespace: 'recovery:mesh:safety',
    lane: 'safety',
    mode: 'policy-what-if',
    pluginCount: 5,
    tags: ['safety', 'guard'],
    constraints: [{
      id: 'safety-drift',
      lane: 'safety',
      code: 'drift',
      severity: 'critical',
      weight: 0.9,
      enabled: true,
      metadata: { source: 'policy', reason: 'safety-first' },
    }],
  },
  {
    namespace: 'recovery:mesh:simulation',
    lane: 'simulation',
    mode: 'simulation',
    pluginCount: 7,
    tags: ['simulation', 'what-if'],
    constraints: [{
      id: 'sim-noise',
      lane: 'simulation',
      code: 'variance',
      severity: 'low',
      weight: 0.2,
      enabled: true,
      metadata: { source: 'forecast', range: 0.2 },
    }],
  },
] as const;

const loadMeshManifests = (): readonly MeshManifest[] => {
  const parsed = z.array(manifestSchema).parse(pluginBlueprints) as readonly z.infer<typeof manifestSchema>[];
  return parsed.map((item: z.infer<typeof manifestSchema>) => parseMeshManifest({
    namespace: item.namespace,
    activeLane: item.activeLane,
    activeMode: item.activeMode,
    pluginCount: item.pluginCount,
    tags: item.tags,
    constraints: item.constraints,
  }));
};

const asBundleRoute = <T extends readonly [MeshLane, MeshMode]>(route: T): MeshPath<[MeshKind, ...T]> => {
  return `mesh/${route[0]}/${route[1]}` as MeshPath<[MeshKind, ...T]>;
};

export const meshSeedCatalog = loadMeshManifests();

export const createConstraintBuckets = <TConstraints extends readonly MeshConstraint[]>(
  constraints: TConstraints,
): Record<MeshLane, readonly MeshConstraint[]> => ({
  signal: constraints.filter((entry) => entry.lane === 'signal'),
  topology: constraints.filter((entry) => entry.lane === 'topology'),
  policy: constraints.filter((entry) => entry.lane === 'policy'),
  safety: constraints.filter((entry) => entry.lane === 'safety'),
  simulation: constraints.filter((entry) => entry.lane === 'simulation'),
});

const normalizeLaneConstraintWeight = (weight: number): number => Math.max(0, Math.min(1, Number(weight)));

export const normalizeConstraintWeights = <TConstraints extends readonly MeshConstraint[]>(
  constraints: TConstraints,
): TConstraints => {
  const normalized = constraints.map((item: TConstraints[number]) => ({
    ...item,
    weight: normalizeLaneConstraintWeight(item.weight),
  })) as unknown as TConstraints;
  return normalized;
};

export const buildMeshManifestDigest = (manifest: MeshManifest): string => {
  const lane = manifest.activeLane;
  const tagDigest = manifest.tags.toSorted().join(',');
  const constraintDigest = manifest.constraints
    .map((entry) => `${entry.id}:${entry.weight}:${entry.enabled}`)
    .toSorted()
    .join('|');
  return `${manifest.namespace}:${lane}:${manifest.activeMode}:${tagDigest}:${constraintDigest}`;
};

export const resolveManifestForLane = (
  seed: MeshRunSeed,
  manifests: readonly MeshManifest[] = meshSeedCatalog,
): MeshManifest => {
  return (
    manifests.find((manifest) => manifest.activeLane === seed.lane && manifest.activeMode === seed.mode) ??
    {
      version: '1.0.0',
      namespace: `recovery:mesh:${seed.lane}`,
      activeLane: seed.lane,
      activeMode: seed.mode,
      pluginCount: 0,
      tags: ['fallback'],
      constraints: [],
    }
  );
};

export const buildMeshEnvelope = (seed: MeshRunSeed): MeshRunEnvelope => {
  const constraints = normalizeConstraintWeights(resolveManifestForLane(seed).constraints);
  const manifest = resolveManifestForLane(seed);
  const runId = toMeshRunId(seed.tenantId, `${seed.source}-${seed.lane}`);
  return {
    runId,
    tenantId: toMeshTenantId(seed.tenantId),
    mode: seed.mode,
    route: asBundleRoute([seed.lane, seed.mode]),
    startedAt: seed.window.from,
    constraints,
  };
};

export const buildMeshContext = <TConfig extends Record<string, unknown>>(
  seed: MeshRunSeed,
  configSchema: z.ZodType<TConfig>,
): MeshRuntimeContext<TConfig> => {
  const payload = parseMeshSeed(seed);
  const contextConfig = configSchema.parse(seed.context as TConfig);
  const manifest = resolveManifestForLane(payload);
  return {
    tenantId: payload.tenantId,
    requestId: `${payload.tenantId}::${manifest.activeLane}::${Date.now()}`,
    namespace: canonicalizeNamespace(`mesh/${manifest.activeLane}/${payload.lane}`),
    startedAt: payload.window.from,
    config: contextConfig,
    runId: toMeshRunId(payload.tenantId, `${manifest.activeLane}:${seed.source}`),
    meshLane: seed.lane,
    meshMode: seed.mode,
    stage: 'warming',
  };
};

export const buildMeshPluginId = (namespace: string, lane: MeshLane, name: string): PluginId => {
  const canonical = canonicalizeNamespace(namespace);
  const kind = `mesh/${lane}` as PluginKind;
  return buildPluginId(canonical, kind, name);
};

export const toMeshDependencyManifest = (ids: readonly string[]): readonly PluginDependency[] =>
  ids.map((id) => `dep:${id}` as PluginDependency);

export const scoreMeshEnvelope = (seed: MeshRunSeed, signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }

  const severityScore = signals.reduce((acc, signal) => acc + severityWeightLookup(signal.severity), 0) / signals.length;
  const constraints = resolveManifestForLane(seed).constraints;
  const constraintScore =
    constraints.length === 0
      ? 0.25
      : constraints.reduce((acc, constraint) => acc + (constraint.enabled ? constraint.weight : 0), 0) / constraints.length;
  return Number(((severityScore + constraintScore) / 2).toFixed(4));
};

export const describeEnvelope = (seed: MeshRunSeed): Readonly<{
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly route: MeshPath<readonly [MeshKind, string, MeshMode]>;
  readonly constraints: number;
}> => {
  const constraints = resolveManifestForLane(seed).constraints;
  return {
    lane: seed.lane,
    mode: seed.mode,
    route: asBundleRoute([seed.lane, seed.mode]),
    constraints: constraints.length,
  };
};

export const pathFromRoute = (route: MeshPath<readonly [MeshKind, ...readonly string[]]>): readonly string[] =>
  String(route).split('/');

export const expandMeshTemplate = <TPath extends string>(path: TPath): readonly string[] =>
  path.split('/');

export const templateKeyFor = <TPath extends string>(path: TPath): MeshTemplateKey<TPath> => {
  return path.replace(/\//g, ':') as MeshTemplateKey<TPath>;
};
