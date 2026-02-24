import { z } from 'zod';
import { withBrand, type Graph, type Edge } from '@shared/core';
import { rankToPriority, type SagaGraphNodeId, type SagaRunPolicyId, type SagaRunStepId } from './constants';
import type { SagaPlanItem, SagaPlan, SagaRun, SagaPolicy } from './model';

const runSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  priority: z.number().min(0).max(1),
  namespace: z.string().min(1),
  region: z.string().min(1),
});

const planStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  weight: z.number().min(0),
  command: z.string().min(1),
  actionType: z.union([z.literal('automated'), z.literal('manual')]),
  dependsOn: z.array(z.string().min(1)),
});

const planSchema = z.object({
  runId: z.string().min(1),
  namespace: z.string().min(1),
  policyId: z.string().min(1),
  steps: z.array(planStepSchema),
  edges: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
  createdAt: z.string().datetime(),
});

const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  enabled: z.boolean(),
  confidence: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  steps: z.array(planStepSchema),
});

type ParsedRun = z.infer<typeof runSchema>;
type ParsedPlanStep = z.infer<typeof planStepSchema>;
type ParsedPlanPayload = z.infer<typeof planSchema>;
type ParsedPolicyPayload = z.infer<typeof policySchema>;

type ParsedPlanEdge = readonly [string, string];

type RawStepId = string;

type PlanStepId = SagaRunStepId;

const toPlanStepId = (value: RawStepId): PlanStepId => withBrand(value, 'SagaRunStepId');
const toPolicyId = (value: string): SagaRunPolicyId => withBrand(`policy:${value}`, 'SagaRunPolicyId');

const toPlanItem = (step: ParsedPlanStep): SagaPlanItem => ({
  id: toPlanStepId(step.id),
  title: step.title,
  weight: step.weight,
  command: step.command,
  actionType: step.actionType,
    dependsOn: step.dependsOn.map((id: string) => toPlanStepId(id)),
});

export const parsePolicyPayload = (value: unknown): SagaPolicy => {
  const parsed: ParsedPolicyPayload = policySchema.parse(value);
  return {
    id: withBrand(parsed.id, 'SagaRunPolicyId'),
    name: parsed.name,
    domain: parsed.domain,
    enabled: parsed.enabled,
    confidence: parsed.confidence,
    threshold: parsed.threshold,
    steps: parsed.steps.map(toPlanItem),
  };
};

export const parseRunPayload = (value: unknown): SagaRun => {
  const parsed: ParsedRun = runSchema.parse(value);
  return {
    id: withBrand(parsed.id, 'SagaRunId'),
    domain: parsed.namespace,
    region: parsed.region,
    policyId: toPolicyId(parsed.owner),
    createdAt: new Date().toISOString(),
    priority: rankToPriority(parsed.priority),
    phase: 'prepare',
    timeline: [],
    steps: [],
    telemetry: {
      latencyMs: 0,
      retries: 0,
      successRate: 1,
      lastStatus: 'queued',
    },
  };
};

export const parsePlanPayload = (value: unknown): SagaPlan => {
  const parsed: ParsedPlanPayload = planSchema.parse(value);
  const steps = parsed.steps.map(toPlanItem);
  return {
    runId: withBrand(parsed.runId, 'SagaRunId'),
    namespace: parsed.namespace,
    policyId: withBrand(parsed.policyId, 'SagaRunPolicyId'),
    steps,
    edges: parsed.edges.map((edge: ParsedPlanEdge) => {
      const [left, right] = edge;
      return [toPlanStepId(left), toPlanStepId(right)];
    }),
    createdAt: parsed.createdAt,
  };
};

export type RuntimePlanPayload = {
  readonly runId: string;
  readonly namespace: string;
  readonly edges: readonly ParsedPlanEdge[];
  readonly steps: readonly {
    readonly source: string;
    readonly target: string;
    readonly relation: 'before' | 'after' | 'parallel';
  }[];
};

const toNodeId = (value: string): SagaGraphNodeId => withBrand(value, 'NodeId');

const inferDependencyGraph = (payload: RuntimePlanPayload): Graph<SagaGraphNodeId, number> => {
  const nodes = new Set<SagaGraphNodeId>([
    toNodeId(payload.runId),
    ...payload.steps.flatMap((step) => [toNodeId(step.source), toNodeId(step.target)]),
  ]);

  const edges = payload.edges.map<Edge<SagaGraphNodeId, number>>((edge: ParsedPlanEdge) => {
    const [from, to] = edge;
    return {
      from: toNodeId(from),
      to: toNodeId(to),
      weight: 1,
    };
  });

  return {
    nodes: [...nodes],
    edges,
  };
};

const toSagaStepId = (value: SagaGraphNodeId): SagaRunStepId => withBrand(value, 'SagaRunStepId');

export const inferPolicyFromRun = (run: SagaRun): SagaPolicy => inferPolicyFromRunFallback(run);

export const inferPlanFromPayload = (payload: RuntimePlanPayload): SagaPlan => {
  const graph = inferDependencyGraph(payload);
  return {
    runId: withBrand(payload.runId, 'SagaRunId'),
    namespace: payload.namespace,
    policyId: toPolicyId(payload.namespace),
    steps: payload.steps.map((step, index) => ({
      id: toPlanStepId(`${payload.namespace}:${index}:${step.source}:${step.target}:${step.relation}`),
      title: `${step.relation}::${step.source}->${step.target}`,
      weight: (step.source.length + step.target.length + index) / 2,
      command: `${step.relation}:${payload.namespace}:${step.source}:${step.target}`,
      actionType: step.relation === 'parallel' ? 'automated' : 'manual',
      dependsOn: [toPlanStepId(step.source)],
    })),
    edges: graph.edges.map((edge) => [toSagaStepId(edge.from), toSagaStepId(edge.to)]),
    createdAt: new Date().toISOString(),
  };
};

export const inferRunFromPolicy = (policy: SagaPolicy): SagaRun => ({
  id: withBrand(`run:${policy.id}`, 'SagaRunId'),
  domain: policy.domain,
  region: 'us-east-1',
  policyId: policy.id,
  createdAt: new Date().toISOString(),
  priority: 'normal',
  phase: 'prepare',
  timeline: [],
  steps: policy.steps,
  telemetry: {
    latencyMs: 0,
    retries: 0,
    successRate: 1,
    lastStatus: 'queued',
  },
});

export const inferPolicyFromRunSteps = (run: SagaRun): SagaPolicy => ({
  id: toPolicyId(run.domain),
  name: `policy:${run.domain}`,
  domain: run.domain,
  enabled: true,
  confidence: 0.77,
  threshold: 0.52,
  steps: run.steps.map((step, index) => ({
    id: toPlanStepId(`${run.id}:step:${index}`),
    title: step.title,
    weight: step.weight,
    command: step.command,
    actionType: step.actionType,
    dependsOn: [...step.dependsOn],
  })),
});

export const inferPolicyFromRunFallback = (run: SagaRun): SagaPolicy => inferPolicyFromRunSteps(run);

export const toPolicyFromSteps = (steps: readonly SagaPlanItem[], namespace: string): SagaPolicy => ({
  id: toPolicyId(namespace),
  name: `policy:${namespace}`,
  domain: namespace,
  enabled: true,
  confidence: Math.min(1, steps.length / 5),
  threshold: 0.5,
  steps: [...steps],
});

export const toRuntimeGraph = (steps: readonly string[]): string =>
  JSON.stringify({
    steps: [...steps],
    createdAt: new Date().toISOString(),
  });

export const normalizeRunPriority = (value: number): SagaPolicy | null => {
  if (Number.isNaN(value) || value < 0 || value > 1) {
    return null;
  }
  return toPolicyFromSteps([], value > 0.5 ? 'high' : 'normal');
};
