import { fail, ok, type Result } from '@shared/result';
import { asNamespace, asRunId, asScenarioId, type StageBoundary } from '@domain/recovery-chaos-lab';
import {
  InMemoryRunRepository,
  pickLatestRows,
  type ChaosRunEnvelope
} from '@data/recovery-chaos-observability';
import {
  buildInsights,
  type ChaosInsight,
  type ChaosIntelligenceRuntime
} from './insights';
import {
  type ChaosRunEvent,
  type ChaosRunReport,
  type RegistryLike,
  type StageResultMap,
  runChaosScenario,
  type ChaosSchedulerOptions
} from '@service/recovery-chaos-orchestrator';

export interface SessionHandle<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly store: InMemoryRunRepository<TStages>;
  readonly events: readonly ChaosRunEvent[];
}

export interface SessionOptions {
  readonly dryRun?: boolean;
  readonly topK?: number;
}

export interface SessionResult<TStages extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly handle: SessionHandle<TStages>;
  readonly runtime: ChaosIntelligenceRuntime<TStages>;
  readonly insights: readonly ChaosInsight<TStages>[];
}

function normalizeTopK(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? 4, 12));
}

function toRuntimeEnvelope<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenarioId: string,
  runId: string,
  report: ChaosRunReport<TStages>,
  stages: TStages
): ChaosRunEnvelope<TStages> {
  const stageStatuses = Object.fromEntries(
    report.trace.map((trace) => [trace.stage, trace.status] as const)
  ) as Record<TStages[number]['name'], any>;

  return {
    namespace: asNamespace(namespace),
    scenarioId: asScenarioId(scenarioId),
    runId: asRunId(runId),
    snapshot: report.snapshot,
    status: report.status,
    progress: report.progress,
    stages,
    statusByStage: stageStatuses as never,
    metrics: {
      metricKey: `runtime:${namespace}:${scenarioId}` as never,
      samples: []
    },
    state: 'active'
  };
}

function syntheticEvents<TStages extends readonly StageBoundary<string, unknown, unknown>[]>(
  runId: ReturnType<typeof asRunId>,
  stages: TStages
): ChaosRunEvent[] {
  return stages.flatMap((stage, index) => [
    {
      runId,
      at: (Date.now() + index * 10) as never,
      kind: 'stage-started',
      stage: stage.name,
      payload: { name: stage.name, index }
    },
    {
      runId,
      at: (Date.now() + index * 10 + 5) as never,
      kind: index % 2 === 0 ? 'stage-complete' : 'stage-failed',
      stage: stage.name,
      payload: { failed: index % 2 === 1, index }
    }
  ]);
}

export async function runChaosSessionWithStore<
  T extends readonly StageBoundary<string, unknown, unknown>[]
>(
  namespace: string,
  scenario: { namespace: string; id: string; stages: T },
  registry: RegistryLike<T>,
  options: SessionOptions = {}
): Promise<Result<SessionResult<T>>> {
  const topK = normalizeTopK(options.topK);
  const report = await runChaosScenario(
    namespace,
    { ...scenario, version: '1.0.0', createdAt: Date.now() as never, title: 'Session' } as never,
    registry,
    { dryRun: options.dryRun } as ChaosSchedulerOptions
  );
  const events = syntheticEvents<T>(report.runId, scenario.stages);
  const store = new InMemoryRunRepository<T>(namespace, scenario.id);
  const envelope = toRuntimeEnvelope(namespace, scenario.id, report.runId, report, scenario.stages);
  const inserted = await store.upsert(envelope);
  if (!inserted.ok) {
    return fail(inserted.error);
  }

  const listed = store.list({ namespace: asNamespace(namespace) });
  if (!listed.ok) {
    return fail(listed.error);
  }

  const latest = pickLatestRows(listed.value, topK);
  const runRows = latest.map((row) => {
    const trace = row.stages.map((stage, index) => ({
      stage: stage.name,
      startedAt: (Date.now() + index * 7) as never,
      endedAt: (Date.now() + index * 7 + 1) as never,
      status: row.status,
      error: row.status === 'failed' ? 'synthesized failure' : undefined
    }));
    return {
      runId: row.runId,
      namespace: row.namespace,
      scenarioId: row.scenarioId,
      status: row.status,
      progress: row.progress,
      snapshot: row.snapshot,
      trace,
      steps: {} as StageResultMap<T>,
      finalAt: Date.now() as never
    } as ChaosRunReport<T>;
  });

  const insights = await buildInsights(namespace, scenario.id, runRows);
  if (!insights.ok) {
    return fail(insights.error);
  }

  const runtime: ChaosIntelligenceRuntime<T> = {
    namespace,
    scenarioId: scenario.id,
    eventCount: events.length,
    report,
    events
  };

  return ok({
    handle: {
      namespace,
      scenarioId: scenario.id,
      store,
      events
    },
    runtime,
    insights: insights.value
  });
}

export async function inspectLatest<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenarioId: string
): Promise<Result<readonly string[]>> {
  const store = new InMemoryRunRepository<T>(namespace, scenarioId);
  const listed = store.list({ namespace: asNamespace(namespace), scenarioId: asScenarioId(scenarioId) });
  if (!listed.ok) {
    return fail(listed.error);
  }
  return ok(pickLatestRows(listed.value, 5).map((row) => String(row.runId)));
}
