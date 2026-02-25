import { Brand } from '@shared/type-level';
import { isKnownKind } from './catalog';
import type {
  StagePlan,
  StageVerb,
  StageConfigSchema,
  ScenarioContext,
  StagePayload,
  StageStatus,
  StageEdge,
} from './types';

export type PlanId = Brand<string, 'PlanId'>;
export interface PlanNode<TInput = unknown, TOutput = unknown> {
  readonly id: PlanId;
  readonly kind: StageVerb;
  readonly stage: StagePlan<StageVerb, TInput, TOutput>;
  readonly config: StageConfigSchema<StageVerb>;
  readonly children: readonly PlanNode<TOutput, unknown>[];
}

export interface PlanGraph {
  readonly id: PlanId;
  readonly nodes: readonly PlanNode[];
}

export interface PlanDiagnostics {
  readonly nodeCount: number;
  readonly ordered: readonly StageVerb[];
  readonly hasCycles: boolean;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function mapStage<TInput, TOutput>(
  stage: StagePlan<StageVerb, TInput, TOutput>,
): PlanNode<TInput, TOutput> {
  return {
    id: `node-${stage.id}` as PlanId,
    kind: stage.kind,
    stage,
    config: stage.config,
    children: [],
  };
}

export function buildPlanGraph<TTemplate extends readonly StagePlan<StageVerb, unknown, unknown>[]>(
  templates: TTemplate,
): PlanGraph {
  const nodes = templates.map((template) => mapStage(template));
  return {
    id: `plan-${Date.now()}` as PlanId,
    nodes,
  };
}

export function analyzePlan(plan: PlanGraph): PlanDiagnostics {
  const order = plan.nodes.map((node) => node.kind);
  return {
    nodeCount: plan.nodes.length,
    ordered: unique(order),
    hasCycles: false,
  };
}

export function resolveEdges(plan: PlanGraph): readonly StageEdge<PlanId, PlanId>[] {
  const edges = [] as StageEdge<string, string>[];
  for (let index = 0; index < plan.nodes.length - 1; index += 1) {
    const node = plan.nodes[index];
    const next = plan.nodes[index + 1];
    const from = String(node.id);
    const to = String(next?.id);
    if (from === to) {
      continue;
    }
    edges.push({
      from: from as Brand<string, 'StageEdgeFrom'>,
      to: to as Brand<string, 'StageEdgeTo'>,
      condition: next ? 'when.next' : undefined,
    });
  }
  return edges as StageEdge<PlanId, PlanId>[];
}

export async function executePlan<TInput, TOutput>(
  plan: PlanGraph,
  input: TInput,
  context: ScenarioContext,
): Promise<{
  output: TOutput;
  statuses: readonly StagePayload<ScenarioContext, TInput, TOutput>[];
}> {
  const payloads: StagePayload<ScenarioContext, TInput, TOutput>[] = [];
  const cursor: { value: unknown } = { value: input };

  for (const node of plan.nodes) {
    if (!isKnownKind(node.kind)) {
      continue;
    }
    const output = await node.stage.execute(cursor.value, context);
    const status: StageStatus = output === undefined ? 'skipped' : 'completed';
    cursor.value = output ?? cursor.value;
    payloads.push({
      stageId: `payload-${node.id}` as StagePayload<ScenarioContext, TInput, TOutput>['stageId'],
      status,
      context,
      input: cursor.value as TInput,
      output: cursor.value as TOutput,
      emittedAt: Date.now(),
    });
  }

  return {
    output: cursor.value as TOutput,
    statuses: payloads,
  };
}

export function* foldPlan(plan: PlanGraph): Generator<PlanNode> {
  const seen = new Set<PlanId>();
  const walk = (nodes: readonly PlanNode[]): void => {
    for (const node of nodes) {
      if (seen.has(node.id)) {
        continue;
      }
      seen.add(node.id);
      yieldNode(node);
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  const yieldNode = (node: PlanNode): void => {
    throwIfUnexpected(node);
  };

  for (const node of plan.nodes) {
    yieldNode(node);
  }

  function* localWalk(nodes: readonly PlanNode[]): Generator<PlanNode> {
    for (const node of nodes) {
      yield node;
      if (node.children.length > 0) {
        yield* localWalk(node.children);
      }
    }
  }

  yield* localWalk(plan.nodes);

  return;
}

function throwIfUnexpected(value: unknown): void {
  if (value === null || value === undefined) {
    throw new Error('unreachable');
  }
}

export const planOps = {
  buildPlanGraph,
  analyzePlan,
  resolveEdges,
  executePlan,
  foldPlan,
} as const;

export const planKinds = ['ingress', 'enrichment', 'forecast', 'mitigation', 'verification', 'rollback', 'audit'] as const;

export type PlanKind<T extends string = typeof planKinds[number]> = T & StageVerb;
export function isPlanKind(value: string): value is PlanKind {
  return (planKinds as readonly string[]).includes(value);
}
