import {
  type ChaosRunSnapshot,
  type EntityId,
  type EpochMs,
  type EventEnvelope,
  type StageBoundary,
  asRunId,
  asScenarioId,
  toEpochMs
} from './types';
import { buildPipelineResult } from './blueprints';

export interface SnapshotEnvelope {
  readonly runId: string;
  readonly snapshot: ChaosRunSnapshot;
  readonly at: EpochMs;
  readonly actor: string;
}

export interface StageTrace<T extends StageBoundary<string, unknown, unknown>> {
  readonly stage: T['name'];
  readonly input: T['input'];
  readonly output: T['output'];
}

export interface ChaosAdapterFrame<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly runId: string;
  readonly namespace: string;
  readonly scenarioId: string;
  readonly stages: TStages;
  readonly stageInputs: { [K in TStages[number]['name']]: Extract<TStages[number], { name: K }>['input'] };
  readonly snapshots: readonly SnapshotEnvelope[];
}

export function mergeSnapshots(
  existing: readonly SnapshotEnvelope[],
  incoming: readonly SnapshotEnvelope[]
): readonly SnapshotEnvelope[] {
  return [...existing, ...incoming].sort((a, b) => Number(a.at) - Number(b.at));
}

export function toSnapshotEnvelope(
  runId: string,
  namespace: string,
  scenarioId: string,
  status: ChaosRunSnapshot['status']
): SnapshotEnvelope {
  const snapshot = buildPipelineResult(
    {
      namespace: namespace as never,
      id: asScenarioId(scenarioId),
      title: 'ad-hoc',
      version: '1.0.0',
      stages: [],
      createdAt: toEpochMs(new Date())
    },
    status
  );

  return {
    runId,
    snapshot: {
      ...snapshot,
      runId: asRunId(runId)
    },
    at: toEpochMs(new Date()),
    actor: 'adapter'
  };
}

export function stepToEntityId(stage: StageBoundary<string, unknown, unknown>): EntityId {
  return `${stage.name}:${JSON.stringify(stage.input)}` as EntityId;
}

export function normalizeStepList<Steps extends readonly StageBoundary<string, unknown, unknown>[]>(
  steps: Steps
): ReadonlySet<StageBoundary<string, unknown, unknown>> {
  return new Set(steps);
}

export function mapStageOutput<
  Steps extends readonly StageBoundary<string, unknown, unknown>[],
  K extends Steps[number]['name']
>(
  steps: Steps,
  key: K
): Extract<Steps[number], { name: K }>['output'] | undefined {
  for (const stage of steps) {
    if (stage.name === key) {
      return stage.output as Extract<Steps[number], { name: K }>['output'];
    }
  }
  return undefined;
}

export function createAdapterFrame<
  TStages extends readonly StageBoundary<string, unknown, unknown>[]
>(
  runId: string,
  namespace: string,
  scenarioId: string,
  stages: TStages
): ChaosAdapterFrame<TStages> {
  const stageInputs = Object.create(null) as {
    [K in TStages[number]['name']]: Extract<TStages[number], { name: K }>['input'];
  };
  for (const stage of stages) {
    stageInputs[stage.name as TStages[number]['name']] = stage.input as never;
  }

  return {
    runId,
    namespace,
    scenarioId,
    stages,
    stageInputs,
    snapshots: stages.map((stage) => toSnapshotEnvelope(runId, namespace, scenarioId, 'idle'))
  };
}
