import type { Brand } from '@shared/type-level';
import {
  asNamespace,
  asRunId,
  asScenarioId,
  type ChaosNamespace,
  type ChaosRunSnapshot,
  type ChaosStatus,
  type EpochMs,
  type RunId,
  type ScenarioId,
  type StageBoundary
} from '@domain/recovery-chaos-lab';

export type ChaosRunScope = Brand<string, 'ChaosRunScope'>;
export type RunStoreState = 'active' | 'archived' | 'drained';
export type StageName<T extends readonly StageBoundary<string, unknown, unknown>[]> = Extract<T[number]['name'], string>;

const asBrand = <T extends string, B extends string>(value: T, _brand: B): Brand<T, B> => value as Brand<T, B>;

const normalizeProgress = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

export interface ChaosMetricSample<TMetric extends string = string, TValue = unknown> {
  readonly metric: Brand<TMetric, 'ChaosMetric'>;
  readonly at: EpochMs;
  readonly value: TValue;
  readonly tags: readonly ChaosRunScope[];
}

export interface ChaosRunMetrics {
  readonly metricKey: Brand<string, 'ChaosMetricKey'>;
  readonly samples: readonly ChaosMetricSample<string, number>[];
  readonly window?: `${number}${'s' | 'm' | 'h' | 'd'}`;
}

export interface ChaosRunEnvelope<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly runId: RunId;
  readonly snapshot: ChaosRunSnapshot;
  readonly status: ChaosStatus;
  readonly progress: number;
  readonly stages: TStages;
  readonly statusByStage: Readonly<Record<StageName<TStages>, ChaosStatus>>;
  readonly metrics: ChaosRunMetrics;
  readonly state: RunStoreState;
}

export interface ChaosRunQuery<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace?: ChaosNamespace;
  readonly scenarioId?: ScenarioId;
  readonly statuses?: readonly ChaosStatus[];
  readonly includeArchived?: boolean;
  readonly stageFilter?: readonly StageName<TStages>[];
}

export interface ChaosRunUpdate<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly status?: ChaosStatus;
  readonly snapshot?: ChaosRunSnapshot;
  readonly progress?: number;
  readonly metrics?: ChaosRunMetrics;
  readonly state?: RunStoreState;
}

export interface ChaosRunIndex {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly runId: RunId;
  readonly seen: EpochMs;
}

export interface StorePage<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly rows: readonly ChaosRunEnvelope<TStages>[];
  readonly cursor?: Brand<string, 'RunStoreCursor'>;
  readonly hasMore: boolean;
}

export interface QueryCursor {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly state: RunStoreState;
  readonly offset: number;
}

export type StageMap<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in T[number] as `stage:${K['name']}`]: K;
};

export interface ChaosRunMetadata {
  readonly buildId: Brand<string, 'ChaosRunBuildId'>;
  readonly source: string;
  readonly observedAt: EpochMs;
}

export type ChaosSnapshotBundle<TStages extends readonly StageBoundary<string, unknown, unknown>[]> = Omit<
  ChaosRunEnvelope<TStages>,
  'metrics' | 'state'
>;

function buildScope<T extends string>(prefix: T): Brand<T, 'ChaosRunScope'> {
  return asBrand(prefix, 'ChaosRunScope');
}

export function createRunEnvelope<TStages extends readonly StageBoundary<string, unknown, unknown>[], TScope extends string>(
  namespace: ChaosNamespace,
  scenarioId: ScenarioId,
  runId: RunId,
  stages: TStages,
  scope: TScope,
  snapshot: ChaosRunSnapshot
): ChaosRunEnvelope<TStages> {
  const metricKey = asBrand(`${String(namespace)}:${String(scenarioId)}`, 'ChaosMetricKey');
  const statusByStage = Object.fromEntries(
    stages.map((stage) => [stage.name, snapshot.status] as const)
  ) as Readonly<Record<StageName<TStages>, ChaosStatus>>;

  const samples = stages.map((stage, index) => ({
    metric: asBrand(`${String(buildScope(scope))}::${String(stage.name)}` as `${string}::${string}`, 'ChaosMetric'),
    at: Date.now() as EpochMs,
    value: Number.isFinite(index) ? index / Math.max(stages.length, 1) : 0,
    tags: [buildScope(`metric:${index}`)]
  }));

  return {
    namespace,
    scenarioId,
    runId,
    snapshot,
    status: snapshot.status,
    progress: normalizeProgress(snapshot.progress),
    stages,
    statusByStage,
    metrics: {
      metricKey,
      samples,
      window: '5m'
    },
    state: 'active'
  };
}

export function createStageStatusMap<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: TStages,
  status: ChaosStatus
): Readonly<Record<StageName<TStages>, ChaosStatus>> {
  const output: Record<string, ChaosStatus> = {};
  for (const stage of stages) {
    output[stage.name] = status;
  }
  return output as Readonly<Record<StageName<TStages>, ChaosStatus>>;
}

export function buildMetricBundle(runs: readonly number[]): ChaosRunMetrics {
  return {
    metricKey: asBrand('observability::run', 'ChaosMetricKey'),
    samples: runs.map((value, index) => ({
      metric: asBrand(`observability::${index}` as const, 'ChaosMetric'),
      at: Date.now() as EpochMs,
      value,
      tags: [buildScope(`bundle:${index}`)]
    })),
    window: '1m'
  };
}

export function normalizeRunEnvelopeId(namespace: string, scenarioId: string, runId: string): string {
  return `${namespace}:${scenarioId}:${runId}`;
}

export function projectStoreKeys<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  rows: readonly ChaosRunEnvelope<TStages>[]
): readonly ChaosRunIndex[] {
  return rows.map((row) => ({
    namespace: asNamespace(row.namespace),
    scenarioId: asScenarioId(row.scenarioId),
    runId: asRunId(row.runId),
    seen: Date.now() as EpochMs
  }));
}

export function projectMetadata(namespace: string, scenarioId: string): ChaosRunMetadata {
  const buildId = asBrand(normalizeRunEnvelopeId(namespace, scenarioId, Date.now().toString()), 'ChaosRunBuildId');
  return {
    buildId,
    source: `${namespace}:${scenarioId}`,
    observedAt: Date.now() as EpochMs
  };
}

export interface ChaosRunEnvelopeRecord<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly id: RunId;
  readonly createdAt: EpochMs;
  readonly envelope: ChaosRunEnvelope<TStages>;
}
