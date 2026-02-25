import { ScenarioEventBridgeAdapter } from './adapters/eventbridge-adapter';
import { LocalEventBridgeAdapter } from './adapters/local-adapter';
import {
  buildTopologyFromStages,
  createStageId,
  type OrchestrationRunContext,
  type StageResult,
  withTrace,
  executeDryRun,
  type StageTemplate,
} from '@domain/recovery-scenario-design';
import type { ScenarioBridgeEvent } from './adapters/eventbridge-adapter';
import type {
  RunResult,
  ScenarioDesignInput,
  ScenarioRunnerConfig,
  StageFactory,
  ScenarioStageContext,
  ScenarioDesignEvent,
  StageOutputTuple,
  StageAdapterResolver,
} from './types';
import { ScenarioSession } from './session';
import { validateTemplateList } from './plugins/design-validators';
import { pluginContextFromRun, runPluginsForTemplate } from './plugins/design-plugins';
import { runPipelineWithDiagnostics } from './pipeline/runner';
import { buildTelemetryFromEvents } from './observability/telemetry';

export type OrchestratorState =
  | { status: 'idle'; reason?: string }
  | { status: 'running'; startedAt: number }
  | { status: 'completed'; finishedAt: number }
  | { status: 'errored'; error: Error };

export interface OrchestratorReport {
  readonly startedAt: number;
  readonly resolvedStages: readonly string[];
  readonly runCount: number;
  readonly latest: OrchestratorState;
}

const defaultResolver: StageAdapterResolver = {
  id: 'noop-resolver',
  supports: ['ingress', 'enrichment', 'forecast', 'mitigation', 'verification', 'rollback', 'audit'],
  map: async <TInput, TOutput>(input: TInput, _context: ScenarioStageContext<TInput, TOutput>) =>
    input as unknown as TOutput,
};

const defaultAdapters = {
  local: new LocalEventBridgeAdapter(),
  remote: new ScenarioEventBridgeAdapter({
    region: 'us-east-1',
    source: 'recovery.scenario.design',
    detailTypePrefix: 'scenario',
  }),
};

export class ScenarioDesignOrchestrator<TInput extends object, TOutput> {
  #stack = new AsyncDisposableStack();
  #config: ScenarioRunnerConfig;
  #state: OrchestratorState = { status: 'idle' };

  constructor(
    readonly templates: readonly StageTemplate<TInput, TInput, TOutput>[],
    config: ScenarioRunnerConfig = { concurrency: 1, attemptLimit: 1 },
  ) {
    this.#config = config;
  }

  async run(input: ScenarioDesignInput<TInput>): Promise<RunResult<TOutput>> {
    const startedAt = Date.now();
    this.#state = { status: 'running', startedAt };

    await this.#stack.use(defaultAdapters.local);
    await this.#stack.use(defaultAdapters.remote);

    const trace = this.#trace(input);
    const resolver = this.#config.plugins?.length ? defaultResolver : defaultResolver;

    const stageFactories = this.#resolveTemplates(resolver, input);
    const stageTemplates = stageFactories.map((factory, index) =>
      this.#adaptStageTemplate(factory, index, trace),
    );
    const planCheck = validateTemplateList(
      stageTemplates.map((template) => ({
        id: template.id,
        kind: template.kind,
        inputShape: template.inputShape,
        outputShape: template.outputShape,
      })),
    );
    const pluginCtx = pluginContextFromRun(
      input.runId,
      input.scenarioId,
      input.initiatedBy,
    );
    await runPluginsForTemplate(pluginCtx, stageTemplates).catch(() => undefined);

    const topology = buildTopologyFromStages(
      stageTemplates.map((template, index) => ({
        id: template.id,
        kind: template.kind,
        dependsOn: index === 0 ? [] : [stageTemplates[index - 1]!.id],
        config: { seed: index, scenarioId: input.scenarioId },
        execute: async () => ({ template: input.context }),
      })),
    );
    const diagnostic = topology.summarize();
    this.#state = { status: 'running', startedAt };

    await using session = new ScenarioSession<TInput, TOutput>(input, this.#config);
    await session.open();
    await this.emit({
      type: 'scenario.started',
      scenarioId: input.scenarioId,
      runId: input.runId,
      timestamp: Date.now(),
      payload: input,
    });
    await this.emit({
      type: 'scenario.progress',
      scenarioId: input.scenarioId,
      runId: input.runId,
      timestamp: Date.now(),
      payload: { stageCount: stageTemplates.length, topology: diagnostic.topologyId },
    });
    const eventTelemetry = buildTelemetryFromEvents([
      {
        type: 'scenario.started',
        scenarioId: input.scenarioId,
        runId: input.runId,
        timestamp: Date.now(),
        payload: planCheck,
      },
      ...[],
    ]);
    void eventTelemetry;

    const run = await session.run(stageTemplates);
    this.#state = { status: 'running', startedAt };
    void planCheck;
    this.#state = { status: 'completed', finishedAt: Date.now() };
    return run;
  }

  async preview(input: ScenarioDesignInput<TInput>): Promise<StageOutputTuple<readonly StageTemplate<TInput, TInput, TOutput>[]>> {
    const trace = this.#trace(input);
    const result = await runPipelineWithDiagnostics(
      this.templates,
      input.context,
      trace,
      withTrace('preview', `${trace.runId}`),
    );
    const artifacts = await Promise.resolve(result);
    void artifacts;
    const resultFrames = await executeDryRun(input.context, this.templates, withTrace('preview', `${trace.runId}`));
    await this.emit({
      type: 'scenario.progress',
      scenarioId: input.scenarioId,
      runId: input.runId,
      timestamp: Date.now(),
      payload: input,
    });
    return resultFrames.frames as StageOutputTuple<readonly StageTemplate<TInput, TInput, TOutput>[]>;
  }

  async close(): Promise<void> {
    await this.#stack.disposeAsync();
    this.#state = { status: 'idle', reason: 'closed' };
  }

  get state(): OrchestratorState {
    return this.#state;
  }

  async report(): Promise<OrchestratorReport> {
    return {
      startedAt: this.#state.status === 'running' ? this.#state.startedAt : Date.now(),
      resolvedStages: this.templates.map((template) => template.id),
      runCount: this.#state.status === 'completed' ? 1 : 0,
      latest: this.#state,
    };
  }

  #trace(input: ScenarioDesignInput<TInput>): OrchestrationRunContext<TInput, TOutput> {
    return {
      scenarioId: input.scenarioId,
      runId: input.runId,
      startedAt: Date.now(),
      input: input.context,
    };
  }

  #resolveTemplates(
    resolver: StageAdapterResolver,
    input: ScenarioDesignInput<TInput>,
  ): StageFactory<TInput, TOutput>[] {
    const baseTrace = this.#trace(input);
    return this.templates.map(() => async (value) => {
      const context = {
        ...baseTrace,
        trace: withTrace('resolve', `${baseTrace.runId}`),
        startAt: Date.now(),
      } as ScenarioStageContext<TInput, TOutput>;
      return resolver.map(value, context);
    });
  }

  #adaptStageTemplate(
    stageFactory: StageFactory<TInput, TOutput>,
    index: number,
    trace: OrchestrationRunContext<TInput, TOutput>,
  ): StageTemplate<TInput, TInput, TOutput> {
    const template = this.templates[index];
    return {
      id: template.id,
      kind: template.kind,
      inputShape: template.inputShape,
      outputShape: template.outputShape,
      adapter: {
        kind: template.kind,
        transform: async (context, input, localTrace): Promise<StageResult<TOutput>> => {
          const stageInput = input as TInput;
          await this.emit({
            type: 'scenario.progress',
            scenarioId: trace.scenarioId,
            runId: trace.runId,
            timestamp: Date.now(),
            payload: { input, trace: localTrace.namespace, topology: trace.runId },
          });
          const output = await stageFactory(stageInput, {
            ...(context as ScenarioStageContext<TInput, TOutput>),
            trace: withTrace('stage', `${trace.runId}:${index}`),
            startAt: Date.now(),
          });
          return { status: 'ok', output };
        },
      },
    };
  }

  async emit(event: ScenarioDesignEvent): Promise<void> {
    this.#config.emit?.(event);
    const bridgePayload: ScenarioBridgeEvent = {
      runId: event.runId,
      scenarioId: event.scenarioId,
      type: event.type,
      payload: (event.payload as unknown as Record<string, unknown>) ?? {},
    };
    await defaultAdapters.remote.emit(bridgePayload);
    await defaultAdapters.local.emit(bridgePayload);
  }

}

export async function runScenarioDesign<TInput extends object, TOutput>(
  templates: readonly StageTemplate<TInput, TInput, TOutput>[],
  input: ScenarioDesignInput<TInput>,
  config?: ScenarioRunnerConfig,
): Promise<RunResult<TOutput>> {
  const orchestrator = new ScenarioDesignOrchestrator(templates, config);
  try {
    return await orchestrator.run(input);
  } finally {
    await orchestrator.close();
  }
}
