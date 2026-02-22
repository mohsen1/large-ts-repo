import { z } from 'zod';
import { Brand } from '@shared/core';
import { ok, fail, type Result, type Fail, type Ok } from '@shared/result';

export type PolicyTemplateId = Brand<string, 'PolicyTemplateId'>;
export type PolicyNodeId = Brand<string, 'PolicyNodeId'>;
export type PolicyActionName = 'allow' | 'notify' | 'quarantine' | 'throttle' | 'block';
export interface CandidateDecision<T = unknown> {
  id: string;
  score: number;
  output: T;
}

const decisionSeverity = z.enum(['low', 'medium', 'high', 'critical']);
const conditionOperator = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'exists']);

const ConditionSchema = z.object({
  field: z.string().min(1),
  operator: conditionOperator,
  value: z.unknown(),
});

const ActionSchema = z.object({
  kind: z.union([z.literal('allow'), z.literal('notify'), z.literal('quarantine'), z.literal('throttle'), z.literal('block')]).transform(
    (value) => value as PolicyActionName,
  ),
  actor: z.string().min(1),
  weight: z.number().min(0).max(100),
  details: z.record(z.string(), z.unknown()).default({}),
});

const RawNodeSchema = z.object({
  id: z.string().min(1),
  rank: z.number().int().nonnegative(),
  actor: z.string().min(1),
  severity: decisionSeverity,
  conditions: z.array(ConditionSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  tags: z.record(z.string(), z.string()).default({}),
});

const RawEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const DecisionPolicyTemplateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  version: z.string().min(1),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  tags: z.record(z.string(), z.string()).default({}),
  nodes: z.array(RawNodeSchema).min(1),
  edges: z.array(RawEdgeSchema).default([]),
});

export type PolicyNode = z.infer<typeof RawNodeSchema> & { id: PolicyNodeId };
export type PolicyEdge = z.infer<typeof RawEdgeSchema>;
export type DecisionPolicyTemplate = z.infer<typeof DecisionPolicyTemplateSchema> & { id: PolicyTemplateId };

export type ParseDecisionPolicyResult = Result<DecisionPolicyTemplate, string>;

export const parseDecisionPolicy = (raw: unknown): ParseDecisionPolicyResult => {
  const parsed = DecisionPolicyTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(';'));
  }

  return ok({
    ...parsed.data,
    id: parsed.data.id as PolicyTemplateId,
  });
};

export const toNodeByIdMap = (nodes: ReadonlyArray<PolicyNode>): ReadonlyMap<PolicyNodeId, PolicyNode> => {
  const map = new Map<PolicyNodeId, PolicyNode>();
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return map;
};

export const validateTemplateTopology = (template: DecisionPolicyTemplate): Result<true, string> => {
  const nodes = new Set(template.nodes.map((node) => node.id));
  const dangling = template.edges.find((edge) => !nodes.has(edge.from as PolicyNodeId) || !nodes.has(edge.to as PolicyNodeId));
  if (dangling) {
    return fail(`Unknown node reference in edge: ${dangling.from}->${dangling.to}`);
  }

  const uniqueActors = new Set(template.nodes.map((node) => node.actor));
  if (uniqueActors.size > template.nodes.length) {
    return fail('Invalid actor declarations');
  }
  return ok(true);
};
