import {
  buildGraphFromPolicy,
  toOutputSamples,
  createGraphId,
  createInputRunId,
  createOperatorId,
  createSignalId,
  createTenantId,
  type IntentPolicy,
  type IntentInput,
  type IntentNodePayload,
  type IntentRunId,
  type PluginContract,
  type IntentStage,
} from '@domain/recovery-intent-graph';
import type { EngineOutput, OrchestratorConfig, OrchestratorRequest } from './types';
import { IntentRuntime } from './runtime';
import { buildDefaultRegistry, toAdapterNames } from './adapters';

const ready = Promise.resolve('recovery-intent-graph-runtime');
const batchLimit = 6;

export interface EngineRunOptions extends OrchestratorConfig {
  readonly namespace: string;
  readonly request: OrchestratorRequest;
  readonly input: IntentInput;
}

export interface PlanExecutionRequest {
  readonly policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>;
  readonly nodes: readonly IntentNodePayload[];
}

export class IntentGraphEngine {
  readonly #runtime: IntentRuntime;
  readonly #cfg: EngineRunOptions;

  constructor(cfg: EngineRunOptions) {
    this.#cfg = cfg;
    this.#runtime = new IntentRuntime(buildDefaultRegistry(), cfg);
  }

  async execute(
    request: PlanExecutionRequest,
  ): Promise<EngineOutput> {
    await ready;
    const graph = buildGraphFromPolicy(request.policy);
    const runId = createInputRunId(`${this.#cfg.namespace}:${Date.now()}`);
    const executionInput: IntentInput = {
      ...this.#cfg.input,
      runId,
    };

    const runtime = await this.#runtime.runPolicy(request.policy, {
      input: executionInput,
      nodes: request.nodes,
      request: this.#cfg.request,
    });

    const runtimePolicyTelemetry = graph.toTelemetry(runId, this.#cfg.input);
    const sampledOutputs = request.policy.steps.map((_, index) =>
      toOutputSamples(request.policy, runId, this.#cfg.input, index, request.nodes.length),
    );

    const outputs = runtime.outputs.length === 0 ? sampledOutputs : runtime.outputs;
    return {
      outcome: runtime.outcome,
      telemetry: [...runtimePolicyTelemetry, ...runtime.telemetry],
      events: runtime.events,
      outputs,
      recommendations: [
        ...new Set([...outputs.flatMap((output) => output.recommendations), ...runtime.outcome.recommendations]),
      ],
    };
  }

  async executeBatch(requests: readonly PlanExecutionRequest[]): Promise<EngineOutput> {
    const queue = requests.toSorted((left, right) => right.nodes.length - left.nodes.length).slice(0, batchLimit);
    const responses = await Promise.all(queue.map((request) => this.execute(request)));

    const allOutcomes = responses.map((response) => response.outcome);
    const allTelemetry = responses.flatMap((response) => response.telemetry);
    const allEvents = responses.flatMap((response) => response.events);
    const allOutputs = responses.flatMap((response) => response.outputs);
    const allRecommendations = responses.flatMap((response) => response.recommendations);

    return {
      outcome: {
        runId: `${this.#cfg.namespace}:batch` as IntentRunId,
        graphId: queue.at(0)?.policy.id ?? createGraphId(this.#cfg.namespace),
        tenant: this.#cfg.input.tenant,
        ok: allOutcomes.every((outcome) => outcome.ok),
        confidence: responses.length === 0 ? 0 : allOutcomes.reduce((acc, outcome) => acc + outcome.confidence, 0) / allOutcomes.length,
        recommendations: allRecommendations,
      },
      telemetry: allTelemetry,
      events: allEvents,
      outputs: allOutputs,
      recommendations: allRecommendations,
    };
  }

  inspect(): {
    readonly adapterCount: number;
    readonly names: readonly string[];
  } {
    const names = toAdapterNames(this.#runtime.adapters());
    return {
      adapterCount: names.length,
      names,
    };
  }
}

export const createDefaultEngine = async (cfg: {
  tenant: string;
  namespace: string;
  requestId: string;
}): Promise<IntentGraphEngine> => {
  await ready;
  return new IntentGraphEngine({
    maxConcurrency: 2,
    retryLimit: 1,
    pluginTimeoutMs: 3_000,
    sampleRate: 1,
    failFast: true,
    namespace: cfg.namespace,
    request: {
      requestId: cfg.requestId,
      tenant: cfg.tenant,
      envelope: `engine://${cfg.namespace}`,
    },
    input: {
      graphId: createGraphId(cfg.namespace),
      runId: `intent-run:${cfg.requestId}` as IntentRunId,
      tenant: createTenantId(cfg.tenant),
      signalId: createSignalId(cfg.requestId),
      requestedBy: createOperatorId(cfg.requestId),
      mode: 'auto',
    },
  });
};
