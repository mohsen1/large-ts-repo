import {
  type PluginDescriptor,
  PluginRegistry,
  type PluginOutput,
  type Result,
  fail,
  ok,
} from '@shared/lab-graph-runtime';
import {
  collectOutputs,
  bootstrapPlan,
  type ExecutionContext,
  type GraphRunId,
  type GraphStep,
} from '@domain/recovery-lab-synthetic-orchestration';
import { createPluginScope, type PluginScope, makePluginId } from '@shared/lab-graph-runtime';
import {
  toExecutionEnvelope,
  type ExecutionEnvelope,
  normalizeBlueprintPayload,
  toAdapterRunId,
} from './adapters.js';
import { TelemetryWindow } from './telemetry.js';
import type { BlueprintAdapterInput } from './adapters.js';

const defaultProfile = {
  concurrency: 4,
  maxWindowMs: 90_000,
  jitterMs: 150,
} satisfies {
  readonly concurrency: number;
  readonly maxWindowMs: number;
  readonly jitterMs: number;
};

export interface RunPlanInput {
  readonly tenant: string;
  readonly namespace: string;
  readonly steps: readonly {
    id: string;
    name: string;
    phase: string;
    node: string;
    intensity: 'calm' | 'elevated' | 'extreme';
    plugin: string;
    estimatedMs: number;
  }[];
  readonly nodes: readonly { id: string; type: 'source' | 'transform' | 'merge' | 'sink'; route: string; tags: readonly string[] }[];
  readonly edges: readonly { id: string; from: string; to: string; latencyMs: number; weight: number }[];
}

export interface RunSessionState {
  readonly runId: GraphRunId;
  readonly stepCount: number;
  readonly completed: number;
  readonly telemetry: readonly { runId: string; name: string; value: number; at: number }[];
}

export interface SimulatedStep extends Record<string, unknown> {
  readonly plugin: string;
  readonly phase: string;
  readonly output: unknown;
}

type SourceOutput = {
  readonly route: string;
  readonly emitted: number;
  readonly step: string;
};

type TransformOutput = {
  readonly transformed: string;
  readonly confidence: number;
};

const makePluginStep = (step: RunPlanInput['steps'][number]): GraphStep<string> => ({
  id: step.id as GraphStep<string>['id'],
  name: step.name,
  phase: step.phase,
  node: step.node as GraphStep<string>['node'],
  intensity: step.intensity,
  plugin: makePluginId(step.plugin),
  estimatedMs: step.estimatedMs,
});

const defaultPlugins = [
  {
    id: makePluginId('step-source'),
    pluginId: makePluginId('plugin-source'),
    name: 'source-collector',
    route: 'source',
    dependencies: [],
    tags: ['intake', 'telemetry'],
    canRun: () => true,
    process: async (
      input: { step: string },
      signal: { value: number },
      context: { labels: Record<string, string> },
    ): Promise<Result<SourceOutput>> => {
      return ok({
        route: context.labels.namespace ?? 'source',
        emitted: signal.value,
        step: input.step,
      });
    },
  },
  {
    id: makePluginId('step-transform'),
    pluginId: makePluginId('plugin-transform'),
    name: 'transform-orchestrator',
    route: 'transform',
    dependencies: [makePluginId('plugin-source')],
    tags: ['pipeline'],
    canRun: () => true,
    process: async (input: { step: string }, signal: { value: number }): Promise<Result<TransformOutput>> => {
      const transformed = `${input.step}::${signal.value}`;
      return ok({
        transformed,
        confidence: Math.min(1, signal.value / 100),
      });
    },
  },
 ] as const satisfies readonly PluginDescriptor<string, { step: string }, SourceOutput | TransformOutput, string>[];

const runPlugins = async (
  scope: PluginScope<{ tenant: string; namespace: string; runId: GraphRunId }>,
  blueprint: {
    runId: GraphRunId;
    namespace: string;
    steps: readonly GraphStep<string>[];
  },
): Promise<{
  outputs: readonly SimulatedStep[];
  envelope: ExecutionEnvelope[];
}> => {
  const registry = new PluginRegistry(defaultPlugins);
  const telemetry = new TelemetryWindow();
  const outputs: SimulatedStep[] = [];
  const envelope: ExecutionEnvelope[] = [];
  const buckets = [...new Set(blueprint.steps.map((step) => step.phase))];

  for (const phase of buckets) {
    scope.setState({ tenant: scope.state.tenant, namespace: blueprint.namespace, runId: blueprint.runId });
    const result = await registry.executePath(
      phase,
      { step: phase },
      { tenant: scope.state.tenant, route: phase, labels: { namespace: blueprint.namespace } },
    );

    let phaseOutput = 0;
    for (const candidate of result) {
      if (!candidate.ok) continue;
      phaseOutput += candidate.value.durationMs;
      outputs.push({
        plugin: candidate.value.plugin,
        phase: candidate.value.durationMs.toString(),
        output: candidate.value.output,
      });
      envelope.push(
        toExecutionEnvelope(
          scope.state.runId,
          {
            id: `${phase}-sim` as GraphStep<string>['id'],
            name: phase,
            phase,
            node: `${scope.state.runId}-node` as GraphStep<string>['node'],
            intensity: 'calm',
            plugin: makePluginId('plugin-simulated'),
            estimatedMs: candidate.value.durationMs,
          },
          candidate.value,
        ),
      );
      telemetry.push('phase.elapsed', phaseOutput, scope.state.runId);
    }
  }

  return { outputs, envelope };
};

export const executeGraphRun = async (
  input: RunPlanInput,
): Promise<Result<RunSessionState>> => {
  const blueprintInput: BlueprintAdapterInput = {
    tenant: input.tenant,
    namespace: input.namespace,
    nodes: input.nodes,
    edges: input.edges,
    steps: input.steps.map(makePluginStep),
    rawRunId: toAdapterRunId(input.tenant),
  };

  const blueprintResult = normalizeBlueprintPayload(blueprintInput);
  if (!blueprintResult.ok) {
    return fail(blueprintResult.error);
  }

  const bootstrap = bootstrapPlan({
    runId: blueprintResult.value.id,
    tenant: blueprintResult.value.tenant,
    namespace: blueprintResult.value.namespace,
    steps: blueprintResult.value.steps,
  });
  if (!bootstrap.ok) {
    return fail(new Error('unable to bootstrap plan'));
  }

  const runContext: ExecutionContext = {
    runId: bootstrap.value.state.runId,
    tenant: blueprintResult.value.tenant,
    namespace: blueprintResult.value.namespace,
    profile: {
      riskThreshold: 0.7,
      maxRuntimeMs: defaultProfile.maxWindowMs,
      maxConcurrency: defaultProfile.concurrency,
    },
    state: { runId: bootstrap.value.state.runId },
    snapshot: bootstrap.value.snapshot,
  };

  await using session = createPluginScope({
    tenant: input.tenant,
    namespace: input.namespace,
    runId: bootstrap.value.state.runId,
  });

  const telemetryWindow = new TelemetryWindow();
  const registryTimer = telemetryWindow.push('registry_size', defaultPlugins.length, runContext.runId);

  const runOutcome = collectOutputs(bootstrap.value.steps, async (step) =>
    ok({
      [step.intensity]: step.phase,
      [`${step.id}-ok`]: step.phase,
    } as Record<string, unknown>),
  );

  const outputs = await runOutcome;

  const simulated = await runPlugins(session, {
    runId: runContext.runId,
    namespace: runContext.namespace,
    steps: bootstrap.value.steps,
  });

  const completed = outputs.length + simulated.outputs.length + registryTimer.value;
  const state: RunSessionState = {
    runId: runContext.runId,
    stepCount: runContext.snapshot.total,
    completed,
    telemetry: telemetryWindow.snapshot(),
  };

  return ok(state);
};
