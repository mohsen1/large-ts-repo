import {
  ratio,
  type ExecutionSnapshot,
  type PluginOutput,
  type Result,
  type RouteNode,
  type RunId,
  fail,
  ok,
} from '@shared/lab-graph-runtime';
import {
  type GraphRunId,
  type GraphStep,
  type NodeId,
  type WorkspaceState,
  type PlanSnapshot,
  type GraphNode,
  makeRunId,
} from './models.js';

export interface RuntimeProfile {
  readonly riskThreshold: number;
  readonly maxRuntimeMs: number;
  readonly maxConcurrency: number;
}

export interface ExecutionContext {
  readonly runId: GraphRunId;
  readonly tenant: string;
  readonly namespace: string;
  readonly profile: RuntimeProfile;
  readonly state: { readonly runId: GraphRunId };
  readonly snapshot: ExecutionSnapshot;
}

export interface RuntimeState {
  readonly runId: GraphRunId;
  readonly tenant: string;
  readonly namespace: string;
  readonly profile: RuntimeProfile;
  readonly total: number;
  completed: number;
}

interface RunInput {
  readonly runId: GraphRunId;
  readonly tenant: string;
  readonly namespace: string;
  readonly steps: readonly GraphStep<string>[];
}

const makeSnapshotNode = (runId: GraphRunId, phase: string, total: number, completed: number): ExecutionSnapshot => ({
  runId: runId as RunId,
  window: { startedAt: Date.now(), endedAt: Date.now() + total },
  tags: new Set([phase]),
  phase,
  completed,
  total,
});

export interface RuntimeStep<TOutput> {
  readonly stepId: GraphStep<string>['id'];
  readonly phase: string;
  readonly output: TOutput;
  readonly durationMs: number;
}

export interface RuntimeProgress {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
  readonly phases: readonly string[];
}

export interface BootstrapResult {
  readonly state: RuntimeState;
  readonly snapshot: ExecutionSnapshot;
  readonly steps: readonly GraphStep<string>[];
  readonly risk: number;
}

const makeRuntimeId = (tenant: string, namespace: string): GraphRunId => makeRunId(`${tenant}::${namespace}::bootstrap`);

export const makeWorkspaceState = (
  runId: GraphRunId,
  tenant: string,
  nodes: readonly { id: string; type: string; route: string; tags: readonly string[] }[],
): WorkspaceState => {
  const normalizedNodes = nodes.map<GraphNode>((node) => ({
    ...node,
    id: node.id as GraphNode['id'],
    type: node.type as GraphNode['type'],
  }));
  const nodeMap = new Map<NodeId, GraphNode>(
    normalizedNodes.map((node) => [node.id as NodeId, node]),
  );

  return {
    runId,
    tenant,
    channel: `${tenant}:channel` as WorkspaceState['channel'],
    nodes: nodeMap,
    edges: [],
    stepCount: normalizedNodes.length,
  };
};

export const createPlanSnapshot = (runId: GraphRunId, namespace: string, total: number): PlanSnapshot => ({
  startedAt: new Date().toISOString(),
  runId,
  namespace,
  progress: 0,
  status: 'pending',
});

export const bootstrapPlan = (input: RunInput): Result<BootstrapResult> => {
  if (input.steps.length === 0) {
    return fail(new Error('plan contains no steps'));
  }

  const byPhase = new Map<string, GraphStep<string>[]>();
  for (const step of input.steps) {
    const current = byPhase.get(step.phase) ?? [];
    byPhase.set(step.phase, [...current, step]);
  }

  const state: RuntimeState = {
    runId: input.runId,
    tenant: input.tenant,
    namespace: input.namespace,
    profile: {
      riskThreshold: 0.65,
      maxRuntimeMs: 120000,
      maxConcurrency: 3,
    },
    total: input.steps.length,
    completed: 0,
  };

  return ok({
    state,
    snapshot: makeSnapshotNode(input.runId, Array.from(byPhase.keys())[0] ?? 'init', input.steps.length, 0),
    steps: input.steps,
    risk: input.steps.length / (input.steps.length + 1),
  });
};

export function* traverseGraph(steps: readonly GraphStep<string>[]): IterableIterator<GraphStep<string>> {
  const sorted = [...steps].sort((left, right) => left.estimatedMs - right.estimatedMs);
  for (const step of sorted) {
    yield step;
  }
}

export async function collectOutputs<TOutput>(
  steps: readonly GraphStep<string>[],
  execute: (step: GraphStep<string>) => Promise<Result<TOutput>>,
): Promise<RuntimeStep<TOutput>[]> {
  const output: RuntimeStep<TOutput>[] = [];
  for (const step of traverseGraph(steps)) {
    const start = Date.now();
    const result = await execute(step);
    if (!result.ok) {
      continue;
    }

    output.push({
      stepId: step.id,
      phase: step.phase,
      output: result.value,
      durationMs: Math.max(1, Date.now() - start),
    });
  }
  return output;
}

export const simulateWorkflow = async <TOutput>(
  blueprint: {
    readonly id: GraphRunId;
    readonly tenant: string;
    readonly namespace: string;
    readonly steps: readonly GraphStep<string>[];
  },
  execute: (step: GraphStep<string>) => Promise<Result<TOutput>>,
): Promise<RuntimeProgress> => {
  const snapshot = bootstrapPlan({
    runId: blueprint.id,
    tenant: blueprint.tenant,
    namespace: blueprint.namespace,
    steps: blueprint.steps,
  });
  if (!snapshot.ok) {
    return { completed: 0, total: 0, percent: 0, phases: [] };
  }

  const outputs = await collectOutputs(blueprint.steps, execute);
  const total = snapshot.value.steps.length;
  const completed = outputs.length;
  return {
    completed,
    total,
    percent: ratio(completed, total) * 100,
    phases: outputs.map((step) => step.phase),
  };
};

export const toNodeKey = (nodeId: NodeId): RouteNode => `${nodeId}:route` as RouteNode;

export const estimateCompletion = (steps: readonly GraphStep<string>[]): number => {
  if (steps.length === 0) return 1;
  const totalMs = steps.reduce((sum, step) => sum + step.estimatedMs, 0);
  return Math.min(1, totalMs / 120_000);
};

export const enrichWorkspace = (blueprint: {
  id: GraphRunId;
  tenant: string;
  namespace: string;
  steps: readonly GraphStep<string>[];
}): RuntimeProgress & { tenant: string } => {
  const phaseEntries: [string, number][] = blueprint.steps.map((step) => [
    step.phase,
    step.estimatedMs,
  ]);
  const phases = Array.from(new Map<string, number>(phaseEntries).keys());

  return {
    completed: 0,
    total: blueprint.steps.length,
    percent: 0,
    phases,
    tenant: blueprint.tenant,
  };
};

export const bootstrapPlanWithNamespace = (
  namespace: string,
  tenant: string,
  steps: readonly GraphStep<string>[],
): Result<BootstrapResult> =>
  bootstrapPlan({
    runId: makeRuntimeId(tenant, namespace),
    tenant,
    namespace: `recovery.${namespace}`,
    steps,
  });

export { PluginOutput, ratio, makeRunId };
