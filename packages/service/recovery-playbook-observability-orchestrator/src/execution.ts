import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import {
  createAnnotationTelemetry,
  createMetricTelemetry,
  createPhaseTelemetry,
  createSignalTelemetry,
  extractTelemetryByChannel,
  summarizeTelemetry,
  type TelemetryEnvelope,
  type TelemetryManifest,
} from '@domain/recovery-playbook-observability-core';
import type {
  ObservabilityRunId,
  ObservabilitySessionId,
  ObservabilityPlaybookId,
  ObservabilityScope,
  ObservabilitySignalId,
  ObservabilityMetricRecord,
  ObservabilityTenantId,
  MetricPath,
  PlaybookRuntimeMetrics,
} from '@domain/recovery-playbook-observability-core';
import {
  PlaybookObservabilityPluginRegistry,
  type PlaybookObservabilityPlugin,
  type PluginExecutionResult,
  type PluginExecutionTrace,
} from '@domain/recovery-playbook-observability-core';

type ExecutionState = {
  readonly runId: ObservabilityRunId;
  readonly tenantId: ObservabilityTenantId;
  readonly sessionId: ObservabilitySessionId;
  readonly playbookId: ObservabilityPlaybookId;
  readonly scope: ObservabilityScope;
  readonly startedAt: string;
};

interface ExecutionWindow {
  readonly score: number;
  readonly drift: number;
}

export interface ExecutionSnapshot {
  readonly manifest: TelemetryManifest;
  readonly window: ExecutionWindow;
  readonly traces: readonly PluginExecutionTrace[];
  readonly events: readonly TelemetryEnvelope[];
}

export class ObservabilityExecutionBuffer<TPlugins extends readonly PlaybookObservabilityPlugin<string, any, any>[]> {
  #events: TelemetryEnvelope[] = [];
  #traces: PluginExecutionTrace[] = [];
  readonly #state: ExecutionState;
  readonly #registry: PlaybookObservabilityPluginRegistry<TPlugins>;

  constructor(registry: PlaybookObservabilityPluginRegistry<TPlugins>, state: ExecutionState) {
    this.#registry = registry;
      this.#state = state;
    }

  get traces(): readonly PluginExecutionTrace[] {
    return this.#traces;
  }

  get events(): readonly TelemetryEnvelope[] {
    return this.#events;
  }

  async appendSignal(signal: ObservabilitySignalId): Promise<Result<PluginExecutionResult<ObservabilitySignalId>, string>> {
    this.#events.push(createSignalTelemetry(this.#state.runId, this.#state.scope));
    const result = await this.#runStage('ingest', { signal, runId: this.#state.runId }, 'signal');
    return result.ok
      ? ok({ ...result.value, output: signal })
      : fail(result.error);
  }

  async appendMetric(
    metric: ObservabilityMetricRecord,
  ): Promise<Result<PluginExecutionResult<ObservabilityMetricRecord>, string>> {
    this.#events.push(createMetricTelemetry(this.#state.runId, this.#state.scope, metric));
    const result = await this.#runStage('normalize', metric, 'metric');
    return result.ok
      ? ok({ ...result.value, output: metric })
      : fail(result.error);
  }

  async appendForecast(
    metrics: PlaybookRuntimeMetrics,
  ): Promise<Result<PluginExecutionResult<PlaybookRuntimeMetrics>, string>> {
    this.#events.push(createPhaseTelemetry(this.#state.runId, this.#state.scope, `forecast-${metrics.trend}`));
    const result = await this.#runStage('forecast', metrics, 'forecast');
    return result.ok
      ? ok({ ...result.value, output: metrics })
      : fail(result.error);
  }

  async appendAlert(message: string): Promise<Result<PluginExecutionResult<{ readonly message: string }>, string>> {
    const annotation = createAnnotationTelemetry(this.#state.runId, this.#state.scope, message);
    this.#events.push(annotation);
    const result = await this.#runStage('alert', { message }, 'alert');
    return result.ok
      ? ok({ ...result.value, output: { message } })
      : fail(result.error);
  }

  async drain(): Promise<Result<ExecutionSnapshot, string>> {
    const manifest = summarizeTelemetry(this.#events);
    const eventsByScope = extractTelemetryByChannel(this.#events, 'raw');
    if (eventsByScope.length === 0) {
      return fail('no-events');
    }

    const window: ExecutionWindow = {
      score: this.#traces.reduce((acc, trace) => acc + trace.ms, 0) / Math.max(1, this.#traces.length),
      drift: this.#traces.length / Math.max(1, this.#events.length),
    };

    return ok({
      manifest,
      window,
      traces: [...this.#traces],
      events: [...this.#events],
    });
  }

  async cleanup(): Promise<void> {
    this.#events = [];
    this.#traces = [];
  }

  async #runStage(
    kind: 'ingest' | 'normalize' | 'enrich' | 'forecast' | 'alert',
    input: unknown,
    stage: string,
  ): Promise<Result<PluginExecutionResult<unknown>, string>> {
    const candidates = this.#registry.byKind(kind);
    const first = candidates[0];
    if (!first) {
      return fail(`missing-plugin:${kind}`);
    }

    const result = await this.#registry.execute(
      kind,
      input as never,
      {
        runId: this.#state.runId,
        playbookId: this.#state.playbookId,
        scope: this.#state.scope,
        traceSeed: `${this.#state.sessionId}:${stage}`,
      },
    );

    if (!result.ok) {
      return fail(`${kind}-rejected:${result.trace.scope}`);
    }

    this.#events.push(
      createPhaseTelemetry(
        this.#state.runId,
        this.#state.scope,
        `${kind}-${result.trace.plugin}-${result.trace.ms}`,
      ),
    );

    const metric = {
      metricId: withBrand(`${this.#state.runId}:${kind}:${result.trace.kind}:${result.trace.ms}`, 'ObservabilityMetricId'),
      tenantId: this.#state.tenantId,
      playbookId: this.#state.playbookId,
      name: `${this.#state.scope}:${result.trace.plugin}` as const,
      scope: this.#state.scope,
      value: result.trace.ms,
      unit: 'ms' as const,
      path: `metric.plugin.${kind}` as MetricPath<string>,
      emittedAt: new Date().toISOString(),
    };

    this.#events.push(createMetricTelemetry(this.#state.runId, this.#state.scope, metric));
    this.#traces.push(result.trace);

    return ok(result);
  }
}
