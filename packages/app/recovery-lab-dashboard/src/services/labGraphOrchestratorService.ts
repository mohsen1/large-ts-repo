import {
  executeGraphRun,
  type RunPlanInput,
  type RunSessionState,
} from '@service/recovery-lab-graph-orchestrator';
import {
  type GraphStep,
  DEFAULT_PROFILE,
  makeChannelId,
  makeRunId,
  type IntensityLevel,
} from '@domain/recovery-lab-synthetic-orchestration';
import { collectBatches, hydrateWithSignal, type PluginSignal } from '@shared/lab-graph-runtime';

const getDefaultChannelSeed = () =>
  ({
    name: 'recovery-lab-dashboard',
    description: 'Recovery lab orchestration channel seed',
    profile: DEFAULT_PROFILE,
  } satisfies {
    name: string;
    description: string;
    profile: typeof DEFAULT_PROFILE;
  });

export interface LabGraphRunInput {
  readonly tenant: string;
  readonly namespace: string;
  readonly runId: string;
  readonly intensity: IntensityLevel;
  readonly nodes: readonly { id: string; type: 'source' | 'transform' | 'merge' | 'sink'; route: string; tags: readonly string[] }[];
  readonly edges: readonly { id: string; from: string; to: string; latencyMs: number; weight: number }[];
  readonly steps: readonly GraphStep<string>[];
}

export interface LabGraphSignalRow {
  readonly step: string;
  readonly plugin: string;
  readonly phase: string;
  readonly value: number;
}

const buildSteps = (input: LabGraphRunInput): RunPlanInput['steps'] =>
  input.steps.map((step, index) => ({
    ...step,
    phase: `${input.namespace}::${step.phase}`,
    intensity: input.intensity,
    estimatedMs: step.estimatedMs + index,
    id: `${step.id}`,
    plugin: `${step.plugin}`,
    node: `${step.node}`,
  }));

const signalFromStep = (step: GraphStep<string>): PluginSignal => ({
  plugin: `${step.plugin}` as PluginSignal['plugin'],
  phase: step.phase,
  value: step.estimatedMs,
  timestamp: Date.now(),
});

export const createGraphPlanInput = (
  tenant: string,
  namespace: string,
  payload: LabGraphRunInput,
): RunPlanInput => {
  const seed = getDefaultChannelSeed();
  return {
    tenant,
    namespace,
    steps: buildSteps(payload),
    nodes: payload.nodes.map((node) => ({
      ...node,
      tags: [...node.tags],
      route: `${seed.name}:${tenant}:${node.route}`,
    })),
    edges: payload.edges,
  };
};

export const runLabGraphPlan = async (
  tenant: string,
  namespace: string,
  payload: Omit<LabGraphRunInput, 'tenant' | 'namespace'>,
): Promise<RunSessionState> => {
  const runId = makeRunId(`${tenant}-${namespace}-${payload.runId}`);
  void makeChannelId(`${getDefaultChannelSeed().name}-${tenant}`);
  const planInput = createGraphPlanInput(tenant, namespace, { ...payload, tenant, namespace });
  const result = await executeGraphRun(planInput);
  if (!result.ok) {
    throw result.error;
  }

  return {
    ...result.value,
    runId,
  };
};

export const streamSignals = async (
  steps: readonly GraphStep<string>[],
): Promise<readonly LabGraphSignalRow[]> => {
  const hydrated = await hydrateWithSignal(steps, signalFromStep);
  const chunks = await collectBatches(hydrated, { batchSize: 12, timeoutMs: 5 });
  return chunks.flatMap((chunk) =>
    chunk.values.map((entry) => ({
      step: `${entry.item.id}`,
      plugin: `${entry.item.plugin}`,
      phase: entry.item.phase,
      value: entry.signal.value,
    })),
  );
};
