import { fail, ok, type Result } from '@shared/result';

import { appendEvent, createMeshRunScope } from './mesh-lifecycle';
import {
  buildPlan,
  asMeshRuntimeMarker,
  defaultTopology,
  type MeshExecutionContext,
  type MeshManifestEntry,
  type MeshOrchestrationOutput,
  type MeshOrchestrationStatus,
  type MeshPolicy,
  type MeshPriorityEnvelope,
  type MeshRuntimeInput,
  type MeshTopology,
  type MeshPhase,
} from '@domain/recovery-fusion-intelligence';
import { MeshPluginRegistry } from '@domain/recovery-fusion-intelligence/src/mesh-registry';
import { toSummary } from './mesh-analytics';

export interface MeshOrchestrationInput {
  readonly topology: MeshTopology;
  readonly policy: MeshPolicy;
  readonly pluginManifests: readonly MeshManifestEntry[];
  readonly context: MeshExecutionContext;
}

interface MeshAdapterSignals {
  readonly commandLog: readonly string[];
  readonly commandWindow: readonly string[];
}

const statusFromPlan = (waveCount: number, registrySize: number, commandCount: number): MeshOrchestrationStatus =>
  waveCount === 0 || registrySize === 0 || commandCount === 0 ? 'degraded' : 'ok';

const normalizePolicy = (policy: MeshPolicy): MeshPolicy => {
  const phaseGating = {
    ...Object.fromEntries(defaultTopology.phases.map((phase) => [phase, true])) as Record<MeshPhase, boolean>,
    ...policy.phaseGating,
  };

  return {
    ...policy,
    phaseGating,
  };
};

const policyPhases = (policy: MeshPolicy): readonly MeshPhase[] =>
  defaultTopology.phases.filter((phase) => policy.phaseGating[phase]);

const collectSignals = (input: MeshRuntimeInput): readonly MeshPriorityEnvelope[] =>
  input.nodes.map((node, index) => ({
    window: input.phases[index % input.phases.length],
    value: Math.max(0, Math.min(5, Math.round(node.score * 5))) as 0 | 1 | 2 | 3 | 4 | 5,
    reasons: [node.role, node.id],
  }));

const collectPlannerInput = (input: MeshOrchestrationInput): MeshRuntimeInput => ({
  phases: policyPhases(input.policy),
  nodes: input.topology.nodes,
  edges: input.topology.edges,
  pluginIds: input.policy.pluginIds,
});

const buildAdapterSignals = (
  input: MeshOrchestrationInput,
  signals: readonly MeshPriorityEnvelope[],
): MeshAdapterSignals => {
  const sorted = [...signals].toSorted((left, right) => right.value - left.value);
  const commandLog = sorted.map((signal) => `command:${signal.window}:${signal.reasons[0]}`);
  const commandWindow = sorted.map((signal, index) => `${input.context.runId}:${signal.window}:${index}`);
  return { commandLog: Object.freeze(commandLog), commandWindow: Object.freeze(commandWindow) };
};

const runPluginAdapters = async (
  registry: MeshPluginRegistry,
  manifests: readonly MeshManifestEntry[],
): Promise<MeshAdapterSignals> => {
  const commandLog: string[] = [];

  await using stack = new AsyncDisposableStack();
  for (const manifest of manifests) {
    stack.defer(() => {
      commandLog.push(`dispose:${manifest.name}`);
    });

    commandLog.push(`prepare:${manifest.name}`);
    if (!registry.has(manifest.name)) {
      continue;
    }

    commandLog.push(`execute:${manifest.name}`);
  }

  return {
    commandLog: Object.freeze(commandLog),
    commandWindow: Object.freeze([`adapter:${commandLog.length}`]),
  };
};

export const executeMeshOrchestration = async (
  input: MeshOrchestrationInput,
): Promise<Result<MeshOrchestrationOutput, Error>> => {
  const policy = normalizePolicy(input.policy);
  const runContext = createMeshRunScope(input.context.runId, input.context, input.pluginManifests);

  if (!runContext.ok) {
    return fail(runContext.error);
  }

  await using scope = runContext.value;
  const plannerInput = collectPlannerInput(input);
  if (plannerInput.nodes.length === 0) {
    return fail(new Error('topology has no nodes to orchestrate'));
  }

  const planSignals = collectSignals(plannerInput);
  const adapterSignals = {
    ...buildAdapterSignals(input, planSignals),
    ...await runPluginAdapters(MeshPluginRegistry.create({ plugins: [] }), input.pluginManifests),
  };

  scope.log({
    phase: plannerInput.phases[0],
    marker: asMeshRuntimeMarker(plannerInput.phases[0]),
    payload: {
      signals: planSignals.length,
      commandWindow: adapterSignals.commandWindow.length,
    },
  });

  const plan = buildPlan(plannerInput);
  const summary = toSummary({
    runId: input.context.runId,
    waveCount: plan.waves.length,
    commandCount: plan.commandIds.length,
    warningCount: plan.telemetry.filter((record) => record.value > 9000).length,
  });
  const status = statusFromPlan(plan.waves.length, input.pluginManifests.length, plan.commandIds.length);
  const output: MeshOrchestrationOutput = {
    runId: input.context.runId,
    status,
    phases: planPhases(plan.waves),
    waves: plan.waves,
    commandIds: plan.commandIds,
    summary: {
      ...summary,
      warningRatio: plan.commandIds.length > 0 ? summary.warningCount / plan.commandIds.length : 0,
    },
  };

  const completedEvents = appendEvent(
    {
      phase: 'finish',
      runId: output.runId,
      marker: asMeshRuntimeMarker('finish'),
      payload: {
        runId: output.runId,
        status,
        totalCommands: [...adapterSignals.commandLog, ...plan.commandIds].length,
      },
    },
    scope.events,
  );
  void completedEvents;

  return ok(output);
};

const planPhases = (waves: MeshOrchestrationOutput['waves']): readonly MeshPhase[] =>
  waves.map((wave) => wave.id as MeshPhase).toSorted().map((phase) => phase);
