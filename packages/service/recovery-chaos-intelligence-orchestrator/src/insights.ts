import { fail, ok, type Result } from '@shared/result';
import {
  asNamespace,
  asScenarioId,
  type ChaosStatus,
  type StageBoundary
} from '@domain/recovery-chaos-lab';
import type {
  ChaosRunEvent,
  ChaosRunReport,
  ChaosRunState,
  StageTrace
} from '@service/recovery-chaos-orchestrator';
import {
  buildBucketReport,
  buildStageHealth,
  detectTrend,
  summarizeRuns,
  type BucketReport,
  type Trend
} from '@data/recovery-chaos-observability';
import { runChaosScenario } from '@service/recovery-chaos-orchestrator';

export interface InsightSignal {
  readonly id: string;
  readonly level: 'ok' | 'warn' | 'danger';
  readonly message: string;
  readonly createdAt: number;
}

export interface ChaosRunTraceProfile {
  readonly stage: string;
  readonly status: ChaosStatus;
}

export interface ChaosRunTraceVector {
  readonly axis: string;
  readonly traces: readonly ChaosRunTraceProfile[];
  readonly variance: number;
}

export interface ChaosInsight<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly report: BucketReport;
  readonly stageHealth: readonly {
    readonly stage: string;
    readonly failures: number;
    readonly runs: number;
    readonly p95Progress: number;
  }[];
  readonly traces: readonly StageTrace[];
  readonly signals: readonly InsightSignal[];
  readonly trend: Trend;
  readonly vector: ChaosRunTraceVector;
}

export interface ChaosTrend {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly direction: 'up' | 'down' | 'flat';
  readonly confidence: number;
}

export interface ChaosIntelligenceRuntime<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly eventCount: number;
  readonly report: ChaosRunReport<T>;
  readonly events: readonly ChaosRunEvent[];
}

const signalCatalog = {
  completeRate: {
    ok: 'run cadence stable',
    warn: 'run cadence below confidence threshold',
    danger: 'run cadence is unstable'
  },
  progress: {
    ok: 'progress is improving steadily',
    warn: 'progress variance exceeds baseline',
    danger: 'progress variance is degraded'
  }
} as const;

function signalFromSample(runCount: number, completeRate: number, delta: number): InsightSignal {
  const message =
    completeRate > 0.66
      ? signalCatalog.completeRate.ok
      : completeRate > 0.33
        ? signalCatalog.completeRate.warn
        : signalCatalog.completeRate.danger;
  const level = delta > 0.05 ? 'ok' : delta > -0.05 ? 'warn' : 'danger';
  const suffix = signalCatalog.progress[level];
  return {
    id: `signal:${runCount}:${completeRate.toFixed(3)}:${delta.toFixed(4)}`,
    level,
    message: `${message} (${suffix})`,
    createdAt: Date.now()
  };
}

function inferSignals(report: BucketReport, trend: Trend): readonly InsightSignal[] {
  return [signalFromSample(report.totals.runCount, report.totals.completeRate, trend.delta)];
}

function summarizeState(state: ChaosRunState): ChaosTrend {
  const progress = state.progress / 100;
  return {
    namespace: String(state.namespace),
    scenarioId: String(state.scenarioId),
    direction: progress > 0.5 ? 'up' : progress < 0.25 ? 'down' : 'flat',
    confidence: Number(progress.toFixed(3))
  };
}

function buildStatusByStage<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  report: ChaosRunReport<T>
): Readonly<Record<T[number]['name'], ChaosStatus>> {
  const map = Object.fromEntries(
    report.trace.map((entry) => [entry.stage, entry.status] as const)
  ) as Record<string, ChaosStatus>;
  return map as Readonly<Record<T[number]['name'], ChaosStatus>>;
}

function toEnvelope<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  report: ChaosRunReport<T>,
  namespace: string,
  scenarioId: string
) {
  return {
    namespace: asNamespace(namespace),
    scenarioId: asScenarioId(scenarioId),
    runId: report.runId,
    status: report.status,
    progress: report.progress,
    snapshot: report.snapshot,
    stages: [] as unknown as T,
    statusByStage: buildStatusByStage(report),
    metrics: {
      metricKey: `insight:${namespace}:${scenarioId}` as never,
      samples: []
    },
    state: 'active' as const
  };
}

export async function buildInsights<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenarioId: string,
  runs: readonly ChaosRunReport<T>[]
): Promise<Result<readonly ChaosInsight<T>[]>> {
  if (!runs.length) {
    return ok([]);
  }

  const envelopes = runs.map((run) => toEnvelope(run, namespace, scenarioId));
  const report = buildBucketReport(namespace, scenarioId, envelopes);
  const trend = detectTrend([report], undefined);
  const stageHealth = buildStageHealth(envelopes);
  const signals = inferSignals(report, trend);
  const metricSummary = summarizeRuns(runs.map((run) => toEnvelope(run, namespace, scenarioId)));
  const traceVectors: ChaosRunTraceProfile[] = [];
  for (const run of runs) {
    for (const entry of run.trace) {
      traceVectors.push({
        stage: entry.stage,
        status: entry.status
      });
    }
  }
  const vector: ChaosRunTraceVector = {
    axis: `${namespace}::axis`,
    traces: traceVectors,
    variance: metricSummary.avgProgress / 100
  };

  const insight: ChaosInsight<T> = {
    namespace,
    scenarioId,
    report,
    stageHealth,
    traces: runs.flatMap((run) => run.trace),
    signals,
    trend,
    vector
  };

  return ok([insight]);
}

export function gatherInsightsFromStore<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenarioId: string,
  store: { list: (query: unknown) => { ok: boolean; value: readonly ChaosRunReport<T>[]; error?: unknown } }
): Promise<Result<readonly ChaosInsight<T>[]>> {
  const listed = store.list({
    namespace,
    scenarioId
  });
  if (!listed.ok) {
    return Promise.resolve(fail(listed.error as Error));
  }
  return buildInsights(namespace, scenarioId, listed.value);
}

export async function runScenarioWithInsights<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  namespace: string,
  scenario: { namespace: string; id: string; stages: T },
  registry: unknown,
  options: { force?: boolean } = {}
): Promise<Result<ChaosIntelligenceRuntime<T>>> {
  const report = await runChaosScenario(
    namespace,
    scenario as never,
    registry as never,
    { dryRun: options.force }
  );

  const summary = summarizeState({
    runId: report.runId,
    namespace: asNamespace(namespace),
    scenarioId: asScenarioId(scenario.id),
    status: report.status,
    progress: report.progress,
    startedAt: Date.now() as never,
    updatedAt: Date.now() as never,
    trace: report.trace
  });
  void summary;

  const terminal: 'run-complete' | 'run-failed' = report.status === 'complete' ? 'run-complete' : 'run-failed';
  const typedReport = report as ChaosRunReport<T>;
  const stageEvents = typedReport.trace.map((trace): ChaosRunEvent => {
    const stageKind = terminal === 'run-complete'
      ? (trace.status === 'verified' ? 'stage-complete' : 'stage-failed')
      : 'stage-failed';
    return {
      runId: report.runId,
      at: trace.startedAt,
      kind: stageKind,
      stage: trace.stage,
      payload: { ...trace }
    };
  });
  const terminalEvent: ChaosRunEvent = {
      runId: report.runId,
      at: report.finalAt,
      kind: terminal,
      status: report.status,
      snapshot: report.snapshot
  };

  const events = [...stageEvents, terminalEvent];

  return ok({
    namespace,
    scenarioId: scenario.id,
    eventCount: report.trace.length,
    report: typedReport,
    events
  } satisfies ChaosIntelligenceRuntime<T>);
}
