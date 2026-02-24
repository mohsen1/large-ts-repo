import { fail, ok, type Result } from '@shared/result';
import type { AsyncDisposable } from 'node:util/types';

import { createMeshRunScope, appendEvent } from './mesh-lifecycle';
import { planWaves, type MeshPlannerInput, type MeshPlannerOutput } from '@domain/recovery-fusion-intelligence/src/mesh-planner';
import {
  type MeshExecutionContext,
  type MeshManifestEntry,
  type MeshPhase,
  type MeshPolicy,
  type MeshRunId,
  type MeshTopology,
  type MeshWave,
} from '@domain/recovery-fusion-intelligence';
import { MeshPluginRegistry } from '@domain/recovery-fusion-intelligence/src/mesh-registry';
import { makeRunId } from '@domain/recovery-fusion-intelligence';
import { toSummary } from './mesh-analytics';

export interface MeshOrchestrationInput {
  readonly topology: MeshTopology;
  readonly policy: MeshPolicy;
  readonly pluginManifests: readonly MeshManifestEntry[];
  readonly context: MeshExecutionContext;
}

export interface MeshOrchestrationOutput {
  readonly runId: MeshRunId;
  readonly status: 'ok' | 'degraded' | 'failed';
  readonly phases: readonly MeshPhase[];
  readonly waves: readonly MeshWave[];
  readonly commandIds: readonly string[];
  readonly summary: ReturnType<typeof toSummary>;
}

type PluginContext = {
  readonly snapshot: {
    readonly runId: string;
    readonly nodeCount: number;
  };
};

const normalizePolicy = (policy: MeshPolicy): MeshPolicy => ({
  ...policy,
  phaseGating: {
    ...policy.phaseGating,
    observe: true,
  },
});

const runWithIterator = async (
  registry: MeshPluginRegistry,
  contexts: readonly MeshManifestEntry[],
  runId: MeshRunId,
): Promise<string[]> => {
  const commandLog: string[] = [];
  const stack = new AsyncDisposableStack();

  try {
    stack.defer(() => {
      commandLog.push(`dispose:${runId}`);
    });

    for await (const manifest of contexts) {
      stack.defer(() => {
        commandLog.push(`plugin:${manifest.name}`);
      });

      await new Promise((resolve) => {
        commandLog.push(`plugin-run:${manifest.name}:${runId}`);
        setTimeout(resolve, 0);
      });
    }
  } finally {
    await stack.disposeAsync();
  }

  return commandLog;
}

const collectPlannerInput = (input: MeshOrchestrationInput): MeshPlannerInput => {
  const runId = makeRunId('runtime', input.context.runId);
  return {
    runId,
    nodes: input.topology.nodes,
    edges: input.topology.edges,
    maxConcurrency: input.policy.maxConcurrency,
    seed: input.context.startedAt,
  };
};

export const executeMeshOrchestration = async (
  input: MeshOrchestrationInput,
): Promise<Result<MeshOrchestrationOutput, Error>> => {
  const policy = normalizePolicy(input.policy);
  const runContext = createMeshRunScope(input.context.runId, input.context);
  if (!runContext.ok) {
    return fail(runContext.error);
  }

  await using scope = runContext.value;
  const registry = MeshPluginRegistry.createWithEntries([]);
  const commandLog = await runWithIterator(registry, input.pluginManifests, input.context.runId);
  const plan: MeshPlannerOutput = planWaves(collectPlannerInput(input));
  const summary = toSummary({
    runId: input.context.runId,
    waveCount: plan.waves.length,
    commandCount: commandLog.length,
    warningCount: plan.telemetry.filter((metric) => metric.value > 9000).length,
  });

  const phases = plan.waves.length
    ? ['plan', 'execute', 'observe']
    : ['finish'];

  return ok({
    runId: input.context.runId,
    status: plan.waves.length > 0 ? 'ok' : 'degraded',
    phases,
    waves: plan.waves,
    commandIds: plan.commandIds,
    summary,
  });
};
