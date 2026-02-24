import {
  OrchestratorPhase,
  OrchestrationRuntimeConfig,
  RuntimeNamespace,
  StageExecutionRecord,
  TraceId,
  makeTraceId,
} from './domain.js';

export interface TraceSpan {
  readonly phase: OrchestratorPhase;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly ok: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface TelemetrySink {
  readonly namespace: RuntimeNamespace;
  readonly write: (event: string) => void;
}

export interface TelemetrySnapshot {
  readonly namespace: RuntimeNamespace;
  readonly spanCount: number;
  readonly failureCount: number;
  readonly totalElapsedMs: number;
  readonly phaseTimeline: ReadonlyArray<string>;
}

const resolvePhaseTimeline = (phases: readonly OrchestratorPhase[]): string[] => phases.map((phase) => `timeline:${phase}`);

export class TraceScope {
  #spans = new Map<string, TraceSpan>();
  #startedAt = Date.now();
  #history: StageExecutionRecord[] = [];

  constructor(
    private readonly sink: TelemetrySink,
    private readonly phases: readonly OrchestratorPhase[],
  ) {
    for (const phase of phases) {
      this.#spans.set(phase, {
        phase,
        startedAt: this.#startedAt,
        ok: true,
        details: { ready: true },
      });
    }
  }

  start(phase: OrchestratorPhase): void {
    this.#spans.set(phase, {
      phase,
      startedAt: Date.now(),
      ok: true,
      details: { started: true },
    });
  }

  complete(phase: OrchestratorPhase, ok: boolean, details: Readonly<Record<string, unknown>>): void {
    const span = this.#spans.get(phase);
    if (!span) return;
    const updated = {
      ...span,
      endedAt: Date.now(),
      ok,
      details: {
        ...span.details,
        ...details,
      },
    };
    this.#spans.set(phase, updated);
    this.sink.write(JSON.stringify(updated));
  }

  push(record: StageExecutionRecord): void {
    this.#history.push(record);
  }

  get snapshot(): TelemetrySnapshot {
    const spans = [...this.#spans.values()];
    const failureCount = spans.filter((span) => !span.ok).length;
    const totalElapsedMs = spans.reduce((acc, span) => acc + ((span.endedAt ?? Date.now()) - span.startedAt), 0);

    return {
      namespace: this.sink.namespace,
      spanCount: spans.length,
      failureCount,
      totalElapsedMs,
      phaseTimeline: resolvePhaseTimeline(this.phases),
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const historyCount = this.#history.length;
    this.sink.write(
      JSON.stringify({
        type: 'scope-complete',
        namespace: this.sink.namespace,
        spans: historyCount,
      }),
    );
  }
}

export const buildTelemetrySink = (namespace: RuntimeNamespace): TelemetrySink => ({
  namespace,
  write: (event: string): void => {
    if (typeof console === 'object' && typeof console.debug === 'function') {
      console.debug(`[telemetry:${namespace}] ${event}`);
    }
  },
});

export async function runWithTracing<T, TPhases extends readonly OrchestratorPhase[]>(
  namespace: RuntimeNamespace,
  phases: [...TPhases],
  runtimeConfig: OrchestrationRuntimeConfig,
  cb: (scope: TraceScope) => Promise<T>,
): Promise<{ result: T; snapshot: TelemetrySnapshot }> {
  const traceId = makeTraceId(namespace);
  const sink = buildTelemetrySink(namespace);
  const stack = new AsyncDisposableStack();
  const scope = new TraceScope(sink, phases);
  stack.use(scope);

  const span = {
    namespace,
    maxConcurrency: runtimeConfig.maxConcurrency,
    timeoutMs: runtimeConfig.timeoutMs,
    retryBudget: runtimeConfig.retryBudget,
    traceId,
  };
  sink.write(`starting:${JSON.stringify(span)}`);

  try {
    const result = await cb(scope);
    return { result, snapshot: scope.snapshot };
  } finally {
    await stack.disposeAsync();
  }
}

export type IterationResult = {
  readonly namespace: RuntimeNamespace;
  readonly entries: ReadonlyArray<TraceSpan>;
};

export function collectIterations(nodes: ReadonlyArray<TraceScope>): IterationResult {
  const namespace = nodes[0]?.snapshot.namespace ?? ('namespace:default' as RuntimeNamespace);
  const entries = nodes.flatMap((node) =>
    node.snapshot.phaseTimeline.map((phase) => ({
      phase: phase.replace('timeline:', 'phase:') as OrchestratorPhase,
      startedAt: Date.now(),
      ok: true,
      details: { from: 'collect', phase },
    } as TraceSpan)),
  );

  return { namespace, entries };
}
