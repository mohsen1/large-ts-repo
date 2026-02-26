import type { PluginStage, HorizonSignal, JsonLike } from '@domain/recovery-horizon-engine';
import { readSignalsWindow } from '@service/recovery-horizon-orchestrator';
import { parseObservatorySignal, toObservabilityFingerprint, foldTimeline, type ObservatorySignalRecord } from '@domain/recovery-horizon-observability';
import { accumulateSignals } from '@domain/recovery-horizon-observability';
import { type ObservabilityTimeline } from '@domain/recovery-horizon-observability';
import type {
  ObservabilityPulseInput,
  ObservabilityPulseState,
  ObservabilityPulseResult,
  ObservabilitySummary,
  PluginExecutionPlan,
  ObservabilityEvent,
  ObservabilitySignalEnvelope,
} from './types';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';
import { createRuntimeRegistry, createRegistrySnapshot } from './registry';

type StackLike = {
  use<T>(value: T): T;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

type RegistryScope = ReturnType<typeof createRuntimeRegistry>;

class ObservabilityScope {
  readonly #events: ObservabilityEvent[] = [];

  constructor(
    public readonly state: ObservabilityPulseState,
    private readonly registry: RegistryScope,
  ) {
    this.#events.push({
      kind: 'snapshot',
      at: state.startedAt,
      tenantId: state.tenantId,
      details: `scope-start:${state.snapshotId}`,
    });
  }

  [Symbol.dispose](): void {
    this.#events.length = 0;
    this.registry[Symbol.dispose]();
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#events.push({
      kind: 'snapshot',
      at: Date.now() as ObservabilityPulseState['startedAt'],
      tenantId: this.state.tenantId,
      details: `scope-stop:${this.state.snapshotId}`,
    });
    return Promise.resolve();
  }

  addEvent(event: ObservabilityEvent) {
    this.#events.push(event);
  }

  snapshot() {
    return this.#events;
  }
}

const normalizeStages = (stages: readonly PluginStage[]) =>
  [...new Set(stages)] satisfies readonly PluginStage[];

const toExecutionPlan = (input: ObservabilityPulseInput): readonly PluginExecutionPlan[] =>
  input.stageWindow.map((stage, index) => ({
    stage,
    runId: (`run:${input.tenantId}:${index}` as unknown) as never,
    pluginKey: `${input.owner}-${stage}-${index}`,
    timestamp: (Date.now() + index) as ObservabilityPulseState['startedAt'],
  }));

const summarize = (signals: readonly ObservabilitySignalEnvelope[]) => {
  const map = signals.reduce<Record<PluginStage, number>>((acc, signal) => {
    acc[signal.signal.stage] = (acc[signal.signal.stage] ?? 0) + 1;
    return acc;
  }, {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  });
  return {
    stages: map,
    totalSignals: signals.length,
    totalErrors: signals.filter((entry) => entry.signal.severity === 'critical' || entry.signal.severity === 'high')
      .length,
    totalWindows: map.ingest + map.analyze + map.resolve + map.optimize + map.execute,
  } satisfies ObservabilitySummary;
};

  const toTimeline = (tenantId: string, rows: readonly HorizonSignal<PluginStage, JsonLike>[]): ObservabilityTimeline => {
  const parsed = rows.map((signal) => {
    const parsedSignal = parseObservatorySignal({
      tenantId,
      runId: signal.input.runId,
      stage: signal.kind,
      at: Date.now(),
      payload: signal.payload,
      severity: signal.severity,
      fingerprint: `${tenantId}:${signal.kind}:${signal.input.runId}`,
      windowId: signal.input.version,
      metricId: `${tenantId}:${signal.kind}:metric`,
      planId: `${tenantId}:${signal.kind}:plan`,
    } as any);
      return parsedSignal;
    });
  const timeline = foldTimeline(tenantId as unknown as Parameters<typeof foldTimeline>[0], parsed as unknown as Parameters<typeof foldTimeline>[1]);
  return timeline;
};

  const toSignalEnvelope = (
    signal: HorizonSignal<PluginStage, JsonLike>,
    tenantId: string,
    index: number,
  ): ObservabilitySignalEnvelope => {
  const record = parseObservatorySignal({
    tenantId,
    runId: signal.input.runId,
    stage: signal.kind,
    at: signal.startedAt,
    payload: {
      ...(signal.payload as Record<string, unknown>),
      errorCount: Math.round(Math.max(0, signal.input.tags.length - 1) / 2),
      durationMs: 250 + index * 17,
    },
    severity: signal.severity,
    fingerprint: toObservabilityFingerprint(tenantId, signal.kind, signal.input.runId),
    windowId: signal.input.version,
    metricId: `metric-${tenantId}-${index}`,
    planId: signal.id,
  } as any);
  return {
    manifest: record.manifest,
    signal: record as unknown as ObservatorySignalRecord,
    fingerprint: record.fingerprint,
    trace: [signal.kind],
  };
};

const resolveStack = (): StackLike => {
  const stack = (globalThis as unknown as {
    AsyncDisposableStack?: new () => StackLike;
  }).AsyncDisposableStack;
  if (!stack) {
    throw new Error('AsyncDisposableStack is unavailable in this runtime');
  }
  return new stack();
};

  const loadWindows = async (tenantId: string, stageWindow: readonly PluginStage[]) => {
    const windowRequest = {
      tenantId,
      stageWindow,
      limit: 500,
    };
    const window = await readSignalsWindow(windowRequest);
    return window.ok ? window.value : [];
  };

export const collectObservabilitySnapshot = async (
  input: ObservabilityPulseInput,
): Promise<Result<ObservabilityPulseResult>> => {
  const normalizedStages = normalizeStages(input.stageWindow);
  const stack = resolveStack();
  const registry = createRuntimeRegistry();
  const plan = toExecutionPlan(input);
  const startedAt = Date.now() as ObservabilityPulseState['startedAt'];
  const state: ObservabilityPulseState = {
    runId: `run:${input.tenantId}:${startedAt}` as never,
    tenantId: input.tenantId as never,
    startedAt,
    stages: normalizedStages,
    snapshotId: (`window:${input.tenantId}:${startedAt}` as never),
  };

  try {
    using _scope = stack.use(new ObservabilityScope(state, registry));
    _scope.addEvent({
      kind: 'refresh',
      at: state.startedAt,
      tenantId: input.tenantId,
      details: `collect:${state.snapshotId}`,
    });
    const windows = await loadWindows(input.tenantId, normalizedStages);
    const envelopes = windows.flatMap((entry, index) =>
      entry.records.map((record) => toSignalEnvelope(record.payload, input.tenantId, index)),
    );

    const metric = accumulateSignals(state.tenantId, envelopes.map((entry) => entry.signal as unknown as HorizonSignal<PluginStage, JsonLike>));
    _scope.addEvent({
      kind: 'trend',
      at: Date.now() as ObservabilityPulseState['startedAt'],
      tenantId: input.tenantId,
      details: `trend:${metric.totalSignals}`,
    });

      const timeline = toTimeline(input.tenantId, envelopes.map((entry) => entry.signal as unknown as HorizonSignal<PluginStage, JsonLike>));
      const _ = {
        registry: createRegistrySnapshot(registry),
        timeline,
    };
    _scope.addEvent({
      kind: 'snapshot',
      at: Date.now() as ObservabilityPulseState['startedAt'],
      tenantId: input.tenantId,
      details: `records:${envelopes.length}`,
    });

      return ok({
      state,
      summary: summarize(envelopes),
      trace: envelopes.map((envelope) => envelope.signal.stage) as readonly PluginStage[],
    });
  } catch (error) {
    return err(error as Error);
  } finally {
    await stack[Symbol.asyncDispose]();
  }
};
