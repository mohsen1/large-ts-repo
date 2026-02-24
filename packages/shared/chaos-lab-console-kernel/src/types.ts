import { z } from 'zod';
import { Brand, type NoInfer, type PathTuple, type PathValue, type RecursivePath } from '@shared/type-level';

export type ChaosScope = 'ingest' | 'stage' | 'analyze' | 'simulate' | 'repair' | 'observe';
export type ChaosRunPhase = `phase:${ChaosScope}`;
export type ChaosRunMode = 'live' | 'dry-run' | 'forecast';

export type ChaosEntityId = Brand<string, 'ChaosEntityId'>;
export type ChaosRunId = Brand<string, 'ChaosRunId'>;
export type ChaosTenantId = Brand<string, 'ChaosTenantId'>;
export type ChaosScenarioId = Brand<string, 'ChaosScenarioId'>;
export type ChaosWorkspaceId = Brand<string, 'ChaosWorkspaceId'>;
export type ChaosPluginKind = Brand<string, 'ChaosPluginKind'>;

export type EpochMs = Brand<number, 'EpochMs'>;
export type HealthScore = Brand<number, 'HealthScore'>;
export type RunEntropy = Brand<number, 'RunEntropy'>;

export type IsoStamp = Brand<string, 'ISOStamp'>;

export type ChaosSignalName = `${ChaosRunPhase}:${Lowercase<ChaosRunPhase>}`;

export type ChaosEnvelopeKey<T extends string> = `${T}::${string}`;

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTuple<Tail>]
  : readonly [];

export type ConcatTuple<A extends readonly unknown[], B extends readonly unknown[]> =
  A extends readonly []
    ? B
    : A extends readonly [infer HeadA, ...infer TailA]
      ? readonly [HeadA, ...ConcatTuple<TailA, B>]
      : readonly [];

export type HeadTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...unknown[]] ? Head : never;

export type TailTuple<T extends readonly unknown[]> =
  T extends readonly [unknown, ...infer Rest]
    ? Rest
    : readonly [];

export type UnionToTuple<T extends string> = T extends any ? [T] : never;

export type ExtractKeys<T> = T extends readonly string[]
  ? T[number]
  : T;

export type RemapStringKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `field:${Lowercase<K & string>}` : never]: T[K];
};

export type RenamePaths<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T & string as `${Prefix}/${K}`]: T[K] extends Record<string, unknown>
    ? RenamePaths<T[K], `${Prefix}/${K}`>
    : T[K];
};

export type RecursivePathKeys<T> = RecursivePath<T>;

export type ValueByPath<T, K extends string> = K extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? ValueByPath<T[Head & keyof T], Rest>
    : Head extends keyof T
      ? T[Head & keyof T]
      : unknown
  : K extends keyof T
    ? T[K & keyof T]
    : unknown;

export type PathTupleOf<T extends Record<string, unknown>> = PathTuple<T>;

export type IsNever<T> = [T] extends [never] ? true : false;

export type NormalizePayload<T> = T extends Record<string, unknown>
  ? { [K in keyof T]: NormalizePayload<T[K]> }
  : T;

export type PluginTuple<T extends ReadonlyArray<PluginDescriptor>> = T;

export type PluginDescriptor = {
  readonly namespace: ChaosTenantId;
  readonly name: ChaosPluginKind;
  readonly scopes: readonly ChaosScope[];
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
};

export type PluginInput<T> = T extends { readonly inputSchema: infer Input } ? Input : never;

export type PluginOutput<T> = T extends { readonly outputSchema: infer Output } ? Output : never;

export type PluginIndex<T extends PluginDescriptor> = T['name'];

export interface ChaosPlaybookNode {
  readonly id: ChaosRunId;
  readonly workspace: ChaosWorkspaceId;
  readonly tenant: ChaosTenantId;
  readonly scenarioId: ChaosScenarioId;
  readonly phase: ChaosRunPhase;
  readonly scope: ChaosScope;
  readonly createdAt: EpochMs;
  readonly expiresAt: EpochMs;
}

export interface ChaosSignalEnvelope<TPayload = unknown> {
  readonly id: ChaosEntityId;
  readonly kind: ChaosSignalName;
  readonly tenant: ChaosTenantId;
  readonly createdAt: IsoStamp;
  readonly at: EpochMs;
  readonly payload: TPayload;
}

export interface ChaosRunManifest<
  TPhases extends readonly ChaosScope[],
  TNode extends ChaosPlaybookNode,
  TMeta extends Record<string, unknown> = {}
> {
  readonly runId: TNode['id'];
  readonly tenant: TNode['tenant'];
  readonly scenarioId: TNode['scenarioId'];
  readonly phases: TPhases;
  readonly metadata: TMeta;
  readonly startedAt: EpochMs;
  readonly completeBy: EpochMs;
}

export type PhaseTuple<T extends readonly ChaosScope[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends ChaosScope
      ? readonly [Head, ...PhaseTuple<Extract<Tail, readonly ChaosScope[]>>]
      : readonly []
    : readonly [];

export type InferPhaseWindow<T extends ChaosRunManifest<readonly ChaosScope[], ChaosPlaybookNode, Record<string, unknown>>> =
  T['phases'][number];

export type WorkspaceSnapshot = {
  readonly id: ChaosWorkspaceId;
  readonly tenant: ChaosTenantId;
  readonly scope: ChaosScope;
  readonly startedAt: EpochMs;
  readonly completedRuns: number;
  readonly lastRunAt?: EpochMs;
  readonly trendScore: HealthScore;
};

export type EntropyWindow<T extends number = number> = `${T}.${number}ms`;

export type RuntimeErrorKind = 'plugin-not-found' | 'input-invalid' | 'run-timeout' | 'scope-mismatch';

export interface RuntimeError {
  readonly kind: RuntimeErrorKind;
  readonly reason: string;
  readonly hint?: string;
  readonly at: EpochMs;
}

export type MetricName = `${string}::${'latency' | 'success' | 'error' | 'signal'}`;

export interface MetricSample {
  readonly metric: MetricName;
  readonly value: number;
  readonly at: EpochMs;
}

export interface MetricPoint {
  readonly name: MetricName;
  readonly samples: readonly MetricSample[];
  readonly score: HealthScore;
}

export type MetricCatalog = {
  readonly [K in MetricName]: MetricPoint;
};

export interface ConsoleWorkspace<TData extends Record<string, unknown> = {}> {
  readonly id: ChaosWorkspaceId;
  readonly tenant: ChaosTenantId;
  readonly scope: ChaosScope;
  readonly mode: ChaosRunMode;
  readonly manifest: ChaosPlaybookManifest;
  readonly status: 'idle' | 'running' | 'paused' | 'complete' | 'failed';
  readonly runs: readonly ChaosRunId[];
  readonly metadata: Readonly<TData>;
}

export interface ChaosRunRecord {
  readonly runId: ChaosRunId;
  readonly scope: ChaosScope;
  readonly startedAt: EpochMs;
  readonly endedAt?: EpochMs;
  readonly phase: ChaosRunPhase;
  readonly events: readonly ChaosSignalEnvelope[];
  readonly errors: readonly RuntimeError[];
  readonly score: HealthScore;
}

export interface ChaosRunPlanMeta {
  readonly requestedBy: string;
  readonly expectedLatencyMs: number;
  readonly forecastWindowMs: number;
  readonly strategy: 'deterministic' | 'adaptive' | 'aggressive';
}

export interface ChaosPlaybookManifest {
  readonly workspace: ChaosWorkspaceId;
  readonly tenant: ChaosTenantId;
  readonly scope: ChaosScope;
  readonly scenario: ChaosScenarioId;
  readonly mode: ChaosRunMode;
  readonly phases: readonly ChaosScope[];
  readonly createdAt: IsoStamp;
}

export type ChaosPluginCatalog =
  | {
      readonly kind: 'inject-latency';
      readonly input: {
        readonly zone: string;
        readonly duration: EntropyWindow;
        readonly severity: HealthScore;
      };
    }
  | {
      readonly kind: 'drop-packets';
      readonly input: {
        readonly ratio: number;
        readonly burstMs: number;
      };
    }
  | {
      readonly kind: 'flush-caches';
      readonly input: { readonly namespace: string };
    };

export type ChaosRunStateTuple<T extends ChaosRunMode> =
  T extends 'live'
    ? readonly ['live', ChaosRunId]
    : T extends 'dry-run'
      ? readonly ['forecast', ChaosRunId]
      : readonly ['observe', ChaosRunId];

export type PluginRuntimeModel<
  TPlugin extends ChaosPluginCatalog,
> = {
  readonly namespace: ChaosTenantId;
  readonly kind: TPlugin['kind'];
  readonly input: TPlugin['input'];
  readonly output: {
    readonly status: ChaosRunPhase;
    readonly score: HealthScore;
    readonly metrics: readonly MetricPoint[];
  };
};

const phaseOrder = ['ingest', 'stage', 'analyze', 'simulate', 'repair', 'observe'] as const satisfies readonly ChaosScope[];

export const chaosPhaseCatalog = phaseOrder;

export const chaosWorkspaceSchema = z
  .object({
    tenant: z.string().uuid(),
    scope: z.enum(['ingest', 'stage', 'analyze', 'simulate', 'repair', 'observe']),
    scenario: z.string().uuid(),
    mode: z.enum(['live', 'dry-run', 'forecast'])
  })
  .strict();

export type ChaosWorkspaceSchema = typeof chaosWorkspaceSchema;

export const pluginCatalogSchema = z.array(
  z.object({
    namespace: z.string(),
    name: z.string().min(3).max(80),
    scopes: z.array(z.string()),
    inputSchema: z.unknown().optional(),
    outputSchema: z.unknown().optional()
  }).passthrough()
);

export type PluginCatalogSchema = z.infer<typeof pluginCatalogSchema>;

export const runEnvelopeSchema = z.object({
  id: z.string(),
  tenant: z.string(),
  kind: z.string(),
  at: z.number().nonnegative(),
  payload: z.unknown(),
  createdAt: z.string()
}).passthrough();

export function asChaosEntityId<T extends string>(value: T): ChaosEntityId {
  return value as unknown as ChaosEntityId;
}

export function asChaosRunId<T extends string>(value: T): ChaosRunId {
  return value as unknown as ChaosRunId;
}

export function asChaosTenantId<T extends string>(value: T): ChaosTenantId {
  return value as unknown as ChaosTenantId;
}

export function asChaosScenarioId<T extends string>(value: T): ChaosScenarioId {
  return value as unknown as ChaosScenarioId;
}

export function asWorkspaceId<T extends string>(value: T): ChaosWorkspaceId {
  return value as unknown as ChaosWorkspaceId;
}

export function isChaosScope(scope: string): scope is ChaosScope {
  return (phaseOrder as readonly string[]).includes(scope);
}

export function inferEventValue<T>(signal: ChaosSignalEnvelope<T>): T {
  return signal.payload;
}

export function resolvePhasePath<T extends readonly ChaosScope[]>(
  phases: NoInfer<T>,
  marker: (phase: T[number], index: number) => string,
): readonly string[] {
  const output: string[] = [];
  for (let index = 0; index < phases.length; index += 1) {
    output.push(marker(phases[index], index));
  }
  return output;
}

export function toEntropy(value: number): RunEntropy {
  return value as unknown as RunEntropy;
}

export function toHealthScore(value: number): HealthScore {
  const sanitized = Math.max(0, Math.min(value, 100));
  return sanitized as unknown as HealthScore;
}
