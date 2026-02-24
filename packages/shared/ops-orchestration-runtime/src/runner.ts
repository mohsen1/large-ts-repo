import {
  OrchestrationGraphPlan,
  OrchestrationRuntimeConfig,
  PluginInput,
  RuntimeArtifact,
  RuntimeNamespace,
  StageDescriptor,
  TraceId,
  StageExecutionRecord,
  OrchestratorPhase,
  DEFAULT_PHASES,
  makeTraceId,
  PluginOutput,
} from './domain.js';
import { PluginRegistry, OrchestratorPluginDescriptor } from './registry.js';
import { buildRuntimeGraph, ensureAcyclic, summarizeGraph } from './topology.js';
import { runWithTracing } from './telemetry.js';
import { DEFAULT_RECORD, parseRuntimeRecord } from './validation.js';

export interface OrchestratorDependencies {
  readonly namespace: RuntimeNamespace;
  readonly config: OrchestrationRuntimeConfig;
  readonly plugins: PluginRegistry<readonly OrchestratorPluginDescriptor[]>;
}

export interface ExecutionResult<TOutput = unknown> {
  readonly output: TOutput;
  readonly history: ReadonlyArray<{
    readonly phase: OrchestratorPhase;
    readonly accepted: boolean;
    readonly score: number;
    readonly message: string;
    readonly namespace: RuntimeNamespace;
  }>;
  readonly runtime: {
    readonly namespace: RuntimeNamespace;
    readonly nodeCount: number;
    readonly edgeCount: number;
  };
  readonly artifacts: readonly RuntimeArtifact[];
  readonly trace: TraceId;
  readonly configFingerprint: string;
}

export const DEFAULT_EXECUTION_PHASES = DEFAULT_RUNTIME_PHASES();

export async function executePlan<
  TInput extends object,
  TOutput extends object,
  TPlan extends OrchestrationGraphPlan<RuntimeNamespace, TInput, TOutput, readonly OrchestratorPhase[]>,
>(
  plan: TPlan,
  input: TInput,
  dependencies: OrchestratorDependencies,
): Promise<ExecutionResult<TOutput>> {
  const profile = await parseRuntimeRecord(DEFAULT_RECORD);
  const graph = buildRuntimeGraph(plan);

  if (!ensureAcyclic(graph)) {
    throw new Error(`cycle detected for namespace=${plan.namespace}`);
  }

  const summary = summarizeGraph(graph);
  const runtimePhases = (profile.phases.length > 0 ? profile.phases : DEFAULT_EXECUTION_PHASES) as readonly OrchestratorPhase[];
  let phasePayload: object = input;

  const context = {
    traceId: makeTraceId(dependencies.namespace),
    phase: runtimePhases[0],
    state: input,
    signalKeys: [] as readonly never[],
  };

  const result = await runWithTracing(dependencies.namespace, [...runtimePhases], dependencies.config, async (scope) => {
    const history: Array<{
      phase: OrchestratorPhase;
      accepted: boolean;
      score: number;
      message: string;
      namespace: RuntimeNamespace;
    }> = [];

    for (const phase of runtimePhases) {
      scope.start(phase);
      const planInput: PluginInput<object> = {
        correlationId: `${dependencies.namespace}:${Date.now()}:correlation` as Brand<'correlation-id'>,
        namespace: dependencies.namespace,
        startedAt: Date.now(),
        tags: ['orchestrator', `phase:${phase}`, `plan:${plan.namespace}`],
        phase,
        payload: phasePayload,
      };

      const pluginResults = await dependencies.plugins.runPhase(phase, planInput, {
        ...context,
        phase,
      });
      const accepted = pluginResults.length > 0;
      const latest = pluginResults.at(-1);
      const score = pluginResults.reduce((acc, current) => acc + Number(current.signal), 0);

      scope.complete(phase, accepted, {
        executedPlugins: pluginResults.length,
        accepted,
        score,
      });

      if (latest?.output) {
        const output = latest.output;
        scope.push({
          phase,
          phaseLabel: `stage:${phase}`,
          input: phasePayload as TInput,
          output: output.payload,
          ok: output.accepted,
          score: output.score,
        });
        phasePayload = output.payload;
      }

      history.push({
        phase,
        accepted,
        score,
        message: `${phase}:${accepted ? 'accepted' : 'skipped'}`,
        namespace: plan.namespace,
      });
    }

    return {
      history,
      payload: phasePayload as TOutput,
    };
  });

  return {
    output: result.result.payload as TOutput,
    history: result.result.history,
    runtime: {
      namespace: plan.namespace,
      nodeCount: summary.nodeCount,
      edgeCount: summary.edgeCount,
    },
    artifacts: flattenArtifacts(plan.stages, plan.namespace),
    trace: `${dependencies.namespace}:${Date.now()}` as unknown as TraceId,
    configFingerprint: `${dependencies.config.namespace}:${dependencies.config.maxConcurrency}:${dependencies.config.timeoutMs}`,
  };
}

function flattenArtifacts(stages: readonly StageDescriptor[], namespace: RuntimeNamespace): readonly RuntimeArtifact[] {
  return stages.map((stage) => ({
    namespace,
    phase: stage.phase,
    kind: `stage:${stage.phase}` as const,
    payload: {
      stage: stage.stageId,
      path: stage.path,
      input: stage.input,
      output: stage.output,
    },
    traceId: `${namespace}:${stage.phase}` as unknown as TraceId,
  }));
}

export function createInput<T extends object>(
  namespace: RuntimeNamespace,
  phase: OrchestratorPhase,
  payload: T,
): PluginInput<T> {
  return {
    correlationId: `${namespace}:${Date.now()}:created` as unknown as Brand<'correlation-id'>,
    namespace,
    startedAt: Date.now(),
    tags: ['created'],
    phase,
    payload,
  };
}

export function summarizePlanPhases<TPlan extends OrchestrationGraphPlan<any, any, any, any>>(plan: TPlan): {
  phases: readonly OrchestratorPhase[];
  version: string;
} {
  return {
    phases: plan.phases,
    version: String(plan.version),
  };
}

function DEFAULT_RUNTIME_PHASES(): readonly OrchestratorPhase[] {
  return [...DEFAULT_PHASES];
}

type Brand<B extends string> = string & { readonly __brand: B };
