import { Brand, Edge, NodeId, withBrand } from '@shared/core';
import { type KeyPaths, RecursivePath } from '@shared/type-level';

export type IncidentTenantId = Brand<string, 'IncidentTenantId'>;
export type IntentRunId = string;
export type IntentStepId = string;
export type IntentSignalId = string;
export type IntentCatalogId = string;
export type IncidentIntentPolicyId = string;

export type IntentNodeId = Brand<string, 'NodeId'>;

export interface IncidentIntentMeta {
  readonly tenantId?: IncidentTenantId;
  readonly owner: string;
  readonly region: string;
  readonly team: string;
}

export type IncidentIntentTuple<T extends readonly unknown[]> = readonly [...T];

export type RouteTemplate<T extends readonly string[]> =
  T extends readonly [infer Head extends string, ...infer Rest extends string[]]
    ? Rest extends readonly [string, ...string[]]
      ? `${Head}/${RouteTemplate<Rest>}`
      : Head
    : string;

export type IncidentIntentPlanTuple<TContext = IncidentContext> = readonly IncidentIntentStepMetadata[];

export type IntentNodeKind = 'collect' | 'infer' | 'synthesize' | 'mitigate' | 'validate' | 'verify';
export type IntentStatus = 'queued' | 'running' | 'blocked' | 'succeeded' | 'degraded' | 'failed';
export type IntentPhase = 'input' | 'analysis' | 'orchestration' | 'execution' | 'postmortem';

export interface PolicyWeights {
  readonly severity: number;
  readonly freshness: number;
  readonly confidence: number;
  readonly cost: number;
}

export interface IncidentIntentPolicy {
  readonly policyId: IncidentIntentPolicyId;
  readonly title: string;
  readonly minimumConfidence: number;
  readonly weight: PolicyWeights;
  readonly tags: readonly string[];
}

export interface IncidentIntentStepOutput {
  readonly generatedAt: string;
  readonly stepId: IntentStepId;
  readonly kind: IntentNodeKind;
  readonly durationMs: number;
  readonly status: IntentStatus;
  readonly output: string;
}

export interface IncidentIntentSignal {
  readonly id: IntentSignalId;
  readonly kind: 'telemetry' | 'log' | 'sli' | 'manual';
  readonly source: string;
  readonly value: number;
  readonly unit: string;
  readonly observedAt: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface IncidentIntentCandidate {
  readonly kind: string;
  readonly confidence: number;
  readonly rationale: string;
}

export interface IncidentContext {
  readonly tenantId: IncidentTenantId;
  readonly incidentId: string;
  readonly startedAt: string;
  readonly affectedSystems: readonly string[];
  readonly severity: 'p1' | 'p2' | 'p3' | 'p4';
  readonly tags: readonly string[];
  readonly meta: IncidentIntentMeta;
}

export interface IncidentIntentStepInput {
  readonly context: IncidentContext;
  readonly candidates: readonly IncidentIntentCandidate[];
  readonly signals: readonly IncidentIntentSignal[];
}

export interface IncidentIntentNodeMeta {
  readonly owner: string;
  readonly capabilities: readonly string[];
  readonly dependencies: readonly IntentNodeId[];
}

export interface IncidentIntentNode {
  readonly id: IntentNodeId;
  readonly kind: IntentNodeKind;
  readonly phase: IntentPhase;
  readonly status: IntentStatus;
  readonly description: string;
  readonly weight: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly meta: IncidentIntentNodeMeta;
}

export interface IncidentIntentEdge {
  readonly from: IntentNodeId;
  readonly to: IntentNodeId;
  readonly reason: string;
  readonly precedence: number;
}

export type IntentTopologyEdge = Edge<IntentNodeId, Readonly<Record<string, unknown>>>;

export interface IncidentIntentStepMetadata {
  readonly stepId: IntentStepId;
  readonly path: string;
  readonly weight: number;
  readonly latencyMs: number;
  readonly labels: Readonly<Record<string, string>>;
}

export interface IncidentIntentRoute<TPrefix extends readonly string[] = readonly []> {
  readonly runId: IntentRunId;
  readonly tenantId: IncidentTenantId;
  readonly steps: readonly IncidentIntentStepMetadata[];
}

export interface IncidentIntentManifest<TContext = IncidentContext> {
  readonly catalogId: IntentCatalogId;
  readonly tenantId: IncidentTenantId;
  readonly title: string;
  readonly summary: string;
  readonly version: `${number}.${number}.${number}`;
  readonly createdAt: string;
  readonly nodes: readonly IncidentIntentNode[];
  readonly edges: readonly IntentTopologyEdge[];
  readonly context: TContext;
}

export interface IncidentIntentEvent<T extends IncidentIntentManifest = IncidentIntentManifest> {
  readonly id: Brand<string, 'IncidentIntentEvent'>;
  readonly tenantId: IncidentTenantId;
  readonly timestamp: string;
  readonly eventType: IntentPhase;
  readonly status: IntentStatus;
  readonly manifest: T;
}

export interface IncidentIntentPhasePlan<TInput = IncidentIntentStepInput, TOutput = IncidentIntentStepOutput> {
  readonly phase: IntentPhase;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface IncidentIntentPlan<TInput = IncidentIntentStepInput, TOutput = IncidentIntentStepOutput> {
  readonly runId: IntentRunId;
  readonly tenantId: IncidentTenantId;
  readonly phases: readonly IncidentIntentPhasePlan<TInput, TOutput>[];
  readonly route: readonly string[];
}

export type IncidentIntentRecord<TContext = IncidentContext> = IncidentIntentManifest<TContext> & {
  readonly manifestType: 'incident-intent';
  readonly route?: IncidentIntentRoute;
};

export type RouteTuple<T extends readonly string[]> = IncidentIntentTuple<['root', ...T]>;
export type StepPathLookup<T> = T extends { readonly route: readonly (infer TRoute)[] }
  ? TRoute extends string
    ? `route:${TRoute}`
    : never
  : never;
export type EventPath<TRecord> = TRecord extends Record<string, unknown>
  ? RecursivePath<TRecord>
  : never;

export interface IncidentIntentPluginContext {
  readonly runId: IntentRunId;
  readonly tenantId: IncidentTenantId;
  readonly phase: IntentPhase;
  readonly startedAt: string;
  readonly route: readonly string[];
}

export type PluginInputFor<TContext> = TContext extends { tenantId: IncidentTenantId }
  ? { tenantId: IncidentTenantId; context: TContext }
  : { tenantId: IncidentTenantId; context: IncidentContext };

export type PluginOutputFrom<TPlugin> = TPlugin extends (
  input: infer TInput,
) => Promise<infer TOutput>
  ? TOutput
  : never;

export const isIncidentIntentManifest = <T extends IncidentIntentManifest>(
  value: unknown,
): value is IncidentIntentRecord<T> => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<IncidentIntentManifest>;
  return (
    typeof candidate.catalogId === 'string' &&
    typeof candidate.tenantId === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges)
  );
};

export const isIntentSignal = (value: unknown): value is IncidentIntentSignal => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<IncidentIntentSignal>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.kind === 'telemetry' || candidate.kind === 'log' || candidate.kind === 'sli' || candidate.kind === 'manual') &&
    typeof candidate.source === 'string' &&
    typeof candidate.value === 'number' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.observedAt === 'string'
  );
};

export const incidentIntentPath = <T extends object>(
  value: T,
  path: KeyPaths<T>,
): unknown => {
  const [head, ...rest] = (path as string).split('.');
  if (!head) return value;
  let current: unknown = value as unknown;
  for (const segment of [head, ...rest]) {
    if (current === null || current === undefined) return undefined;
    const object = current as Record<string, unknown>;
    current = object[segment];
  }
  return current;
};

export const describeRoute = <T extends readonly string[]>(
  route: T,
): RouteTemplate<T & string[]> => route.join('/') as RouteTemplate<T & string[]>;

export const createIncidentTenantId = (value: string): IncidentTenantId => withBrand(value.toLowerCase(), 'IncidentTenantId');
export const createIntentRunId = (seed: string): IntentRunId => `${seed}-${Date.now()}`;
export const createIntentStepId = (seed: string, index: number): IntentStepId => `${seed}-${index}-${Math.abs(index + 11)}`;
export const createIntentPolicyId = (seed: string): IncidentIntentPolicyId => seed.toLowerCase();
export const createIntentSignalId = (seed: string): IntentSignalId => seed;

export const normalizeVersion = (value: string): `${number}.${number}.${number}` =>
  /^(\d+)\.(\d+)\.(\d+)$/.test(value)
    ? (value as `${number}.${number}.${number}`)
    : '1.0.0';

export const manifestVersion = (version: string): `${number}.${number}.${number}` => normalizeVersion(version);

export const hasManifestType = (
  value: { readonly manifestType?: unknown },
): value is { readonly manifestType: 'incident-intent' } => value.manifestType === 'incident-intent';

export const identityPath = <T>(value: T): T => value;
