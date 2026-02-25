import { mapWithIteratorHelpers, runPipeline } from '@shared/type-level';
import { ok, type Result } from '@shared/result';
import {
  asRun,
  asSession,
  asWindow,
  type AnalyticsPlanRecord,
  type ScenarioMetrics,
  buildPipeline,
  buildScenarioFingerprint,
  summarizeSignalsByKind,
  evaluateMetricPoints,
  type AnalyticsTenant,
} from '@domain/recovery-ecosystem-analytics';
import type {
  OrchestratorDependencies,
  OrchestratorFacade,
  OrchestratorOptions,
  AnalyzeRequest,
  AnalyzeResult,
  SignalEmitter,
} from './ports';
import type { AnalyticsStoreSignalEvent, AnalyticsStoreRunRecord } from '@data/recovery-ecosystem-analytics-store';

type TimelineDiagnostics = {
  readonly signature: string;
  readonly timeline: readonly string[];
};

type PipelineInput = {
  readonly events: readonly AnalyticsStoreSignalEvent[];
};

const timelineKind = (value: string): `signal:${string}` =>
  value.startsWith('signal:') ? (value as `signal:${string}`) : (`signal:${value}` as `signal:${string}`);

const buildTimeline = (events: readonly AnalyticsStoreSignalEvent[]): readonly string[] =>
  mapWithIteratorHelpers(events, (entry) => `${entry.kind}@${entry.at}`);

const buildMatrixFromKinds = (kinds: readonly `signal:${string}`[]) => {
  const nodes = kinds;
  const edges: [string, string][] = [];
  for (const [index, node] of kinds.entries()) {
    const next = kinds[index + 1];
    if (next) {
      edges.push([node, next]);
    }
  }
  return { nodes, edges };
};

const toNumber = (value: unknown): number => (typeof value === 'number' ? value : 1);

const summarizeEventsByRun = (events: readonly AnalyticsStoreSignalEvent[]): ScenarioMetrics => {
  const signalPayloads = events.map((entry) => ({
    kind: entry.kind,
    runId: asRun(entry.runId),
    namespace: entry.namespace,
    at: entry.at,
    payload: entry.payload,
  }));
  const summaryByKind = summarizeSignalsByKind(signalPayloads, 'tenant:runtime');
  const base = evaluateMetricPoints(events.map((entry) => ({ value: toNumber(entry.payload) })));
  const signalCount = Object.keys(summaryByKind).length;
  return {
    score: base.score + signalCount,
    confidence: base.confidence,
    warningCount: base.warningCount,
    criticalCount: base.criticalCount,
    signals: Object.keys(summaryByKind),
    matrix: base.matrix,
  };
};

export class AnalyticsScenarioEngine implements OrchestratorFacade {
  readonly #store: OrchestratorDependencies['store'];
  readonly #emitter: SignalEmitter;
  readonly #options: OrchestratorOptions;

  constructor(dependencies: OrchestratorDependencies, options: OrchestratorOptions, emitter: SignalEmitter) {
    this.#store = dependencies.store;
    this.#options = options;
    this.#emitter = emitter;
  }

  async startScenario<TSignals extends readonly string[]>(input: AnalyzeRequest<TSignals>): Promise<Result<AnalyzeResult>> {
    const runId = asRun(`run:${input.tenant.replace('tenant:', '')}-${Date.now()}`);
    const session = asSession(`session:${runId}`);
    const window = asWindow(`window:${this.#options.window}`);
    await this.#store.open({
      runId,
      tenant: input.tenant,
      namespace: input.namespace,
      window,
      session,
    });

    await this.#store.appendStage(runId, {
      stage: 'stage:bootstrap',
      startedAt: new Date().toISOString(),
      status: 'running',
      diagnostics: ['bootstrap'],
    });

    const events: AnalyticsStoreSignalEvent[] = [];
    for (const [index, signal] of input.signals.entries()) {
      const stored: AnalyticsStoreSignalEvent = {
        id: `event:${index}` as `event:${number}`,
        kind: timelineKind(signal.kind),
        runId,
        session,
        tenant: input.tenant,
        namespace: input.namespace,
        window,
        payload: signal.payload,
        at: new Date().toISOString(),
      };
      await this.#store.append(stored);
      const emitted = await this.#emitter.emit({ kind: stored.kind, payload: stored.payload }, runId);
      events.push(stored, emitted);
    }

    const diagnostics = await runPipeline<PipelineInput, TimelineDiagnostics>('recovery-ecosystem-analytics', [
      async (value) => ({
        signature: buildPipeline(runId, [], 'runtime'),
        timeline: buildTimeline(value.events),
      }),
    ], { events });

    await this.#store.appendStage(runId, {
      stage: 'stage:complete',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'done',
      diagnostics: [diagnostics.signature, ...diagnostics.timeline],
    });

    await this.#store.close(runId);

    const summary = summarizeEventsByRun(events);
    const fingerprint = buildScenarioFingerprint([input.tenant, input.namespace]);
    return ok({
      runId,
      summary,
      eventCount: events.length,
      fingerprint: fingerprint[0] ?? (`fingerprint:${runId}` as `fingerprint:${string}`),
    });
  }

  async evaluateTopology(plan: AnalyticsPlanRecord): Promise<Result<ScenarioMetrics>> {
    const phases = plan.phases as Record<string, { name: string }>;
    const names = Object.values(phases).map((phase) => phase.name);
    const signature = buildPipeline(asRun(plan.planId.replace('plan:', 'run-')), names.length ? [] as never : [], plan.planId);
    const kinds = names.map((name) => timelineKind(name));
    const matrix = buildMatrixFromKinds(kinds);
    return ok({
      score: names.length * 8 + signature.length,
      confidence: Math.min(1, Math.max(0.1, 0.25 + names.length / 16)),
      warningCount: Object.keys(phases).length,
      criticalCount: 0,
      signals: names,
      matrix,
    });
  }

  async hydrateRuns(tenant: AnalyzeRequest<string[]>['tenant']): Promise<readonly AnalyticsStoreRunRecord[]> {
    return this.#store.queryRuns({ tenant });
  }
}

export const createScenarioEngine = (
  dependencies: OrchestratorDependencies,
  options: OrchestratorOptions,
  emitter: SignalEmitter,
): OrchestratorFacade => new AnalyticsScenarioEngine(dependencies, options, emitter);

export const runScenarioWithDefaults = async <const TSignals extends readonly string[]>(
  request: AnalyzeRequest<TSignals>,
  dependencies: OrchestratorDependencies,
  options: OrchestratorOptions = {
    tenant: request.tenant,
    namespace: request.namespace,
    window: asWindow('window:runtime'),
  },
): Promise<Result<AnalyzeResult>> => {
  const facade = createScenarioEngine(dependencies, options, {
    emit: async (event, runId) => ({
      id: `event:${Date.now()}` as `event:${number}`,
      kind: event.kind,
      runId,
      session: asSession(`bootstrap:${runId}`),
      tenant: request.tenant,
      namespace: request.namespace,
      window: options.window,
      payload: event.payload,
      at: new Date().toISOString(),
    }),
  });
  return facade.startScenario(request);
};
