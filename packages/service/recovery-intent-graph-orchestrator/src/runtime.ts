import {
  createNodeId,
  createOutputWithPayload,
  type IntentExecutionContext,
  type IntentExecutionResult,
  type IntentInput,
  type IntentNodeConfig,
  type IntentNodePayload,
  type IntentOutput,
  type IntentPolicy,
  type IntentGraphId,
  type IntentRunId,
  type IntentStage,
  type IntentTelemetry,
  type PluginContract,
  type PluginFailure,
  type PluginResult,
} from '@domain/recovery-intent-graph';
import type {
  AdapterRegistry,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorRequest,
  OrchestratorResult,
} from './types';
import type { AdapterProfileCatalog } from './adapters';

type StageContext = Omit<IntentExecutionContext<IntentNodePayload>, 'node' | 'payload' | 'abort'>;
type StageResult = PluginResult<IntentNodePayload>;

export class IntentRuntime {
  readonly #registry: AdapterRegistry;
  readonly #cfg: OrchestratorConfig;
  readonly #events: OrchestratorEvent[] = [];

  constructor(registry: AdapterRegistry, cfg?: Partial<OrchestratorConfig>) {
    this.#registry = registry;
    this.#cfg = {
      maxConcurrency: 2,
      retryLimit: 1,
      pluginTimeoutMs: 3_000,
      sampleRate: 1,
      failFast: true,
      ...cfg,
    };
  }

  adapters(): AdapterProfileCatalog {
    if ('profileTuples' in this.#registry) {
      return this.#registry as AdapterProfileCatalog;
    }
    return { profileTuples: [] };
  }

  async runPolicy<TCatalog extends readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>(
    policy: IntentPolicy<TCatalog>,
    request: StageContext & {
      readonly request: OrchestratorRequest;
      readonly nodes: readonly IntentNodePayload[];
    },
  ): Promise<OrchestratorResult> {
    const startedAt = new Date();
    const { input, request: orchestrationRequest, nodes } = request;
    const runId = input.runId;
    const stack = new AsyncDisposableStack();
    const telemetry: IntentTelemetry[] = [];
    const outputs: IntentOutput[] = [];
    const stageResults: IntentExecutionResult[] = [];
    const events: OrchestratorEvent[] = [];

    const recordEvent = (name: OrchestratorEvent['name'], payload: Readonly<Record<string, unknown>>) => {
      const event = {
        runId,
        graphId: policy.id,
        name,
        payload,
        at: new Date(),
      };
      events.push(event);
      this.#events.push(event);
    };

    recordEvent('started', {
      tenant: input.tenant,
      stages: policy.steps.length,
      nodes: nodes.length,
    });

    try {
      for (const [stageIndex, stage] of policy.steps.entries()) {
        const nodePayload = nodes.at(stageIndex) ?? nodes.at(0) ?? { kind: stage, weight: 1 };
        const node: IntentNodeConfig = {
          graphId: input.graphId,
          nodeId: createNodeId(input.graphId, `${stage}-${runId}`),
          kind: stage,
          stageLabel: `${stage.toUpperCase()}_STAGE` as IntentNodeConfig['stageLabel'],
          payload: nodePayload,
          timeoutMs: this.#cfg.pluginTimeoutMs,
          retries: this.#cfg.retryLimit,
          metadata: {
            owner: input.requestedBy,
            createdAt: new Date(),
            labels: [stage],
            labelsByStage: {
              capture: [stage],
              normalize: [stage],
              score: [stage],
              recommend: [stage],
              simulate: [stage],
              resolve: [stage],
            },
          },
        };

        const plugins = this.#registry.resolve(stage);
        const plugin = plugins.at(0);
        recordEvent('node-entered', { stage, adapters: plugins.length, node: node.nodeId });

        if (!plugin) {
          const missing: IntentExecutionResult = {
            runId,
            graphId: input.graphId,
            tenant: input.tenant,
            ok: false,
            confidence: 0,
            recommendations: [`${stage}:missing`],
          };
          outputs.push(
            this.makeOutput({
              input,
              node,
              payload: nodePayload,
              recommendations: missing.recommendations,
              score: 0,
              elapsedMs: 0,
            }),
          );
          stageResults.push(missing);
          telemetry.push(this.makeTelemetry(runId, input, stage, 0));
          recordEvent('node-failed', { stage, reason: 'missing-adapter' });
          if (this.#cfg.failFast) break;
          continue;
        }

        const start = Date.now();
        using _scope = new PluginScope(runId, stage);
        const context: IntentExecutionContext<IntentNodePayload> = {
          input,
          node,
          payload: nodePayload,
          abort: new AbortController().signal,
        };

        let result: StageResult;
        try {
          result = (await this.withTimeout(plugin.run(context))) as StageResult;
        } catch (error) {
          result = {
            ok: false,
            error: {
              message: error instanceof Error ? error.message : 'plugin-execution-error',
              code: 'plugin-execution-error',
            },
          };
        }
        const elapsed = Date.now() - start;
        telemetry.push(this.makeTelemetry(runId, input, stage, elapsed));

        const stageOutcome = this.toExecutionResult({
          input,
          stage,
          elapsedMs: elapsed,
          result,
        });
        stageResults.push(stageOutcome);

        if (result.ok) {
          outputs.push(result.output);
          recordEvent('node-completed', { stage, elapsedMs: elapsed, outputScore: result.output.score });
          continue;
        }

        outputs.push(
          this.makeOutput({
            input,
            node,
            payload: nodePayload,
            recommendations: stageOutcome.recommendations,
            score: 0,
            elapsedMs: elapsed,
          }),
        );
        const failure = result as PluginFailure;
        recordEvent('node-failed', {
          stage,
          reason: failure.error.code,
          message: failure.error.message,
          elapsedMs: elapsed,
        });
        if (this.#cfg.failFast) {
          break;
        }
      }

      const outcome = this.composeOutcome(input.graphId, input.tenant, runId, stageResults);
      const finishedAt = new Date();
      recordEvent('completed', {
        outputCount: outputs.length,
        recommendationCount: outcome.recommendations.length,
      });

      return {
        outcome,
        telemetry,
        events,
        outputs,
        recommendations: [...new Set(outputs.flatMap((output) => output.recommendations))],
        state: {
          request: orchestrationRequest,
          events,
          startedAt,
          finishedAt,
        },
      };
    } finally {
      await stack.disposeAsync();
    }
  }

  private makeTelemetry(
    runId: IntentRunId,
    input: IntentInput,
    stage: IntentStage,
    elapsed: number,
  ): IntentTelemetry {
    return {
      runId,
      graphId: input.graphId,
      nodeId: createNodeId(input.graphId, `${stage}:${runId}`),
      tenant: input.tenant,
      elapsedMs: elapsed,
      stageTimings: {
        capture: stage === 'capture' ? elapsed : 0,
        normalize: stage === 'normalize' ? elapsed : 0,
        score: stage === 'score' ? elapsed : 0,
        recommend: stage === 'recommend' ? elapsed : 0,
        simulate: stage === 'simulate' ? elapsed : 0,
        resolve: stage === 'resolve' ? elapsed : 0,
      },
    };
  }

  private makeOutput(params: {
    input: IntentInput;
    node: IntentNodeConfig;
    payload: IntentNodePayload;
    recommendations: readonly string[];
    score: number;
    elapsedMs: number;
  }): IntentOutput {
    const output = createOutputWithPayload(
      {
        input: params.input,
        nodeId: params.node.nodeId,
        payload: params.payload,
        recommendations: params.recommendations,
      },
      params.score,
      params.elapsedMs,
    );
    if (output.ok) {
      return output.output;
    }

    return {
      runId: params.input.runId,
      graphId: params.input.graphId,
      tenant: params.input.tenant,
      nodeId: params.node.nodeId,
      score: params.score,
      elapsedMs: params.elapsedMs,
      recommendations: params.recommendations,
    };
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`plugin-timeout-${this.#cfg.pluginTimeoutMs}`)), this.#cfg.pluginTimeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
  }

  private composeOutcome(
    graphId: IntentGraphId,
    tenant: IntentInput['tenant'],
    runId: IntentRunId,
    stageResults: readonly IntentExecutionResult[],
  ): IntentExecutionResult {
    const score = stageResults.reduce((acc, stageResult) => (stageResult.ok ? acc + 1 : acc), 0);
    const confidence = stageResults.length === 0 ? 0 : score / stageResults.length;
    return {
      runId,
      graphId,
      tenant,
      ok: stageResults.every((stageResult) => stageResult.ok),
      confidence,
      recommendations: [...new Set(stageResults.flatMap((stageResult) => stageResult.recommendations))],
    };
  }

  private toExecutionResult(params: {
    input: IntentInput;
    stage: IntentStage;
    elapsedMs: number;
    result: StageResult;
  }): IntentExecutionResult {
    if (params.result.ok) {
      return {
        runId: params.input.runId,
        graphId: params.input.graphId,
        tenant: params.input.tenant,
        ok: true,
        confidence: Math.min(1, Math.max(0.05, params.result.output.score / 100)),
        recommendations: params.result.output.recommendations,
      };
    }
    const failure = params.result as PluginFailure;
    return {
      runId: params.input.runId,
      graphId: params.input.graphId,
      tenant: params.input.tenant,
      ok: false,
      confidence: 0,
      recommendations: [
        `${params.stage}:failed:${failure.error.code}`,
        `${params.elapsedMs}ms:${failure.error.message}`,
      ],
    };
  }
}

class PluginScope {
  constructor(
    private readonly runId: IntentRunId,
    private readonly stage: IntentStage,
  ) {}

  [Symbol.dispose](): void {
    void this.runId;
    void this.stage;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}
