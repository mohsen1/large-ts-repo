import {
  type BlueprintDocument,
  type GraphRunId,
  type GraphStep,
  toBlueprint,
  makeChannelId,
  type WorkflowBlueprint,
} from '@domain/recovery-lab-synthetic-orchestration';
import {
  fail,
  ok,
  type Result,
  type RouteNode,
  type PluginOutput,
  type ExecutionSnapshot,
} from '@shared/lab-graph-runtime';

export interface BlueprintAdapterInput {
  readonly tenant: string;
  readonly namespace: string;
  readonly nodes: readonly { id: string; type: 'source' | 'transform' | 'merge' | 'sink'; route: string; tags: readonly string[] }[];
  readonly edges: readonly { id: string; from: string; to: string; latencyMs: number; weight: number }[];
  readonly steps: readonly GraphStep<string>[];
  readonly rawRunId: string;
}

export interface ExecutionEnvelope {
  readonly runId: GraphRunId;
  readonly route: string;
  readonly node: RouteNode;
  readonly snapshot: ExecutionSnapshot;
}

export const toAdapterRunId = (tenant: string): GraphRunId => `${tenant}::${Date.now()}` as GraphRunId;

export const normalizeBlueprintPayload = (input: BlueprintAdapterInput): Result<WorkflowBlueprint<string>> => {
  const blueprint: BlueprintDocument = {
    id: `${input.tenant}-${input.rawRunId}`,
    tenant: input.tenant,
    namespace: input.namespace,
    createdAt: new Date().toISOString(),
    nodes: input.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      route: node.route,
      tags: [...node.tags],
    })),
    edges: input.edges,
    steps: input.steps,
    metadata: {
      version: 1,
      channel: makeChannelId(input.tenant),
    },
  };

  try {
    return ok(
      toBlueprint({
        id: toAdapterRunId(input.tenant),
        tenant: input.tenant,
        namespace: input.namespace,
        nodes: blueprint.nodes,
        edges: blueprint.edges,
        steps: blueprint.steps,
      }),
    );
  } catch (error) {
    return error instanceof Error ? fail(error) : fail(new Error('invalid blueprint'));
  }
};

export const toExecutionEnvelope = (
  runId: GraphRunId,
  step: GraphStep<string>,
  output: PluginOutput<unknown>,
): ExecutionEnvelope => ({
  runId,
  route: step.phase,
  node: `${runId}::${step.id}` as RouteNode,
  snapshot: {
    runId,
    window: { startedAt: Date.now(), endedAt: Date.now() },
    tags: new Set(step.intensity === 'extreme' ? ['high', 'urgent'] : [step.intensity]),
    phase: step.phase,
    completed: output.durationMs,
    total: output.durationMs,
  },
});
