import { Brand } from '@shared/type-level';

export type Branded<T, B extends string> = T & Brand<T & string, B>;

export type RawId = string;
export type TenantId = Branded<`tenant:${string}`, 'tenant-id'>;
export type ScenarioId = Branded<`scenario:${string}`, 'scenario-id'>;
export type RunId = Branded<`run:${string}`, 'run-id'>;

export type BrandNamespace<T extends string> = Branded<`namespace:${T}`, 'namespace'>;
export type PluginId = `plugin:${string}`;

export type TemplatePath<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...TemplatePath<Tail>]
  : readonly [T];

export type JoinTemplatePath<T extends readonly string[]> = T extends readonly [infer Head extends string]
  ? Head
  : T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? `${Head}/${JoinTemplatePath<Tail>}`
    : never;

export type PluginKind = 'source' | 'transform' | 'gate' | 'safety' | 'synthesis';

export type NodeRole = 'source' | 'processor' | 'sink';

export type NodeId = Branded<`node:${string}`, 'node-id'>;
export type SignalId = Branded<`signal:${string}`, 'signal-id'>;
export type ProfileNamespace = BrandNamespace<string>;

export type QuantumNode = {
  readonly id: NodeId;
  readonly route: `/${string}`;
  readonly role: NodeRole;
};

export type QuantumEdge = {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly latencyMs: number;
};

export type QuantumGraph = {
  readonly nodes: readonly QuantumNode[];
  readonly edges: readonly QuantumEdge[];
};

export type QuantumSignalState = 'pending' | 'active' | 'resolved' | 'degraded';

export type RunArtifact = {
  readonly artifactType: string;
  readonly payload: Readonly<unknown>;
  readonly generatedAt: string;
};

export type QuantumProfile<TMetadata extends Record<string, unknown> = Record<string, unknown>> = {
  readonly namespace: ProfileNamespace;
  readonly tenant: TenantId;
  readonly scenarioId: ScenarioId;
  readonly scenarioName: string;
  readonly graph: QuantumGraph;
  readonly metadata: Readonly<TMetadata>;
  readonly seedSignals: readonly {
    readonly signalId: SignalId;
    readonly tier: 1 | 2 | 3;
    readonly weight: number;
  }[];
};

export type ScenarioSeed<TMetadata extends Record<string, unknown> = Record<string, unknown>> = {
  readonly tenant: TenantId;
  readonly scenarioId: ScenarioId;
  readonly profile: QuantumProfile<TMetadata>;
  readonly selectedPlugins: readonly string[];
  readonly requestedMode: 'discovery' | 'control' | 'synthesis';
};

export type QuantumRunResult<TOutput = unknown> = {
  readonly runId: RunId;
  readonly scenarioId: ScenarioId;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly producedAt: string;
  readonly tenant: TenantId;
  readonly output: Readonly<TOutput>;
  readonly artifacts: readonly RunArtifact[];
  readonly traces: readonly string[];
};

export type RecursiveTemplate<T extends string> = T extends `${infer Head}-${infer Tail}`
  ? readonly [Head, ...RecursiveTemplate<Tail>]
  : readonly [T];

export type ConditionalMap<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `cfg:${K}` : never]: T[K];
};

export type ExtractNamespaceSuffix<T> = T extends `namespace:${infer S}` ? S : never;
export type NamespaceByValue<T extends BrandNamespace<string>> = T extends BrandNamespace<infer U> ? U : never;

export const toTemplateParts = <T extends string>(value: T): TemplatePath<T> => {
  const raw = value.split('/') as readonly string[];
  return raw as TemplatePath<T>;
};

export const templateToRoute = <T extends string>(value: T): JoinTemplatePath<TemplatePath<T>> => {
  const parts = toTemplateParts(value);
  return parts.join('/') as JoinTemplatePath<TemplatePath<T>>;
};

export const normalizeProfile = <TMetadata extends Record<string, unknown>>(profile: QuantumProfile<TMetadata>): QuantumProfile<TMetadata> => {
  return {
    ...profile,
    scenarioName: profile.scenarioName.trim(),
    seedSignals: [...profile.seedSignals]
      .map((entry) => ({
        ...entry,
        weight: Number(entry.weight.toFixed(3)),
      }))
      .toSorted((left, right) => left.signalId.localeCompare(right.signalId)),
  };
};

export const namespaceId = (value: string): BrandNamespace<string> => `namespace:${value}` as BrandNamespace<string>;
export const tenantId = (value: string): TenantId => `tenant:${value}` as TenantId;
export const scenarioId = (value: string): ScenarioId => `scenario:${value}` as ScenarioId;
export const runId = (value: string): RunId => `run:${value}` as RunId;
export const nodeId = (value: string): NodeId => `node:${value}` as NodeId;
export const signalId = (value: string): SignalId => `signal:${value}` as SignalId;
export const pluginFromRoute = <T extends string>(namespace: string, name: T): `${T}` => `${namespace}/${name}` as `${T}`;

export const isTenantId = (value: unknown): value is TenantId =>
  typeof value === 'string' && value.startsWith('tenant:');

export const isScenarioId = (value: unknown): value is ScenarioId =>
  typeof value === 'string' && value.startsWith('scenario:');

export const isRunId = (value: unknown): value is RunId =>
  typeof value === 'string' && value.startsWith('run:');

export const isNamespaceId = (value: unknown): value is BrandNamespace<string> =>
  typeof value === 'string' && value.startsWith('namespace:');

export const isSignalId = (value: unknown): value is SignalId =>
  typeof value === 'string' && value.startsWith('signal:');

export const isNodeId = (value: unknown): value is NodeId =>
  typeof value === 'string' && value.startsWith('node:');

export const isQuantumNode = (value: unknown): value is QuantumNode => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return isNodeId(candidate.id) && typeof candidate.role === 'string' && ['source', 'processor', 'sink'].includes(candidate.role) && typeof candidate.route === 'string' && candidate.route.startsWith('/');
};

export const isRunArtifact = (value: unknown): value is RunArtifact => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.artifactType === 'string' && typeof candidate.generatedAt === 'string';
};

export const isQuantumGraph = (value: unknown): value is QuantumGraph => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    return false;
  }
  return candidate.nodes.every(isQuantumNode) && candidate.edges.every(isQuantumEdge);
};

export const isQuantumEdge = (value: unknown): value is QuantumEdge => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return isNodeId(candidate.from) && isNodeId(candidate.to) && typeof candidate.latencyMs === 'number';
};

export const isScenarioSeed = <TMetadata extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown,
): value is ScenarioSeed<TMetadata> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isTenantId(candidate.tenant) &&
    isScenarioId(candidate.scenarioId) &&
    isQuantumGraph((candidate.profile as { graph: unknown })?.graph) &&
    candidate.profile !== null &&
    typeof candidate.profile === 'object' &&
    typeof (candidate.profile as { scenarioName: unknown }).scenarioName === 'string' &&
    isNamespaceId((candidate.profile as { namespace: unknown }).namespace) &&
    isTenantId((candidate.profile as { tenant: unknown }).tenant) &&
    isScenarioId((candidate.profile as { scenarioId: unknown }).scenarioId) &&
    Array.isArray(candidate.selectedPlugins) &&
    ['discovery', 'control', 'synthesis'].includes(candidate.requestedMode as string)
  );
};

export const isValidSeed = isScenarioSeed;

export const isTenantSeed = (value: unknown): value is TenantId => {
  return typeof value === 'string' && value.startsWith('tenant:');
};

export type ProfileByMode = {
  [M in 'discovery' | 'control' | 'synthesis' as `mode:${M}`]: ReadonlyArray<ScenarioSeed>;
};

export type RouteTokens<T extends string> =
  T extends `${infer Head}/${infer Tail}`
    ? readonly [Head, ...RouteTokens<Tail>]
    : readonly [T];

export type PathDepth<T extends string> = RouteTokens<T>['length'];

export const routeDepth = <T extends string>(value: T): PathDepth<T> => {
  return toTemplateParts(value).length as PathDepth<T>;
};
