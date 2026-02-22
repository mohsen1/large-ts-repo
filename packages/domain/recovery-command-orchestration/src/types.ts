import { withBrand, type Brand, type PageArgs, type PageResult, normalizeLimit } from '@shared/core';
import type { AsyncMapper, AsyncReducer } from '@shared/type-level';
import { z } from 'zod';

export type CommandSeverity = 'info' | 'warning' | 'critical';
export type CommandUrgency = 'low' | 'medium' | 'high';
export type CommandConstraintState = 'pending' | 'active' | 'deferred' | 'blocked' | 'resolved';
export type CommandExecutionState = 'queued' | 'running' | 'successful' | 'failed' | 'retry';

export type CommandNodeId = Brand<string, 'CommandNodeId'>;
export type CommandWaveId = Brand<string, 'CommandWaveId'>;
export type CommandGraphId = Brand<string, 'CommandGraphId'>;
export type CommandTraceId = Brand<string, 'CommandTraceId'>;

export type CommandPayload = Readonly<Record<string, unknown>>;
export type CommandAttributes = Record<string, string | number | boolean | null>;

export interface CommandNode<TState extends string = string, TMeta extends CommandPayload = CommandPayload> {
  readonly id: CommandNodeId;
  readonly graphId: CommandGraphId;
  readonly name: string;
  readonly group: string;
  readonly weight: number;
  readonly severity: CommandSeverity;
  readonly urgency: CommandUrgency;
  readonly state: CommandConstraintState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stateAt: string;
  readonly stateReason?: string;
  readonly stateWindow?: {
    from: string;
    to: string;
  };
  readonly version: number;
  readonly metadata: {
    readonly owner: string;
    readonly region: string;
    readonly labels: readonly string[];
    readonly tags: readonly string[];
    readonly tagsVersion: number;
  };
  readonly attributes?: TMeta;
  readonly extensionState?: TState;
}

export interface CommandEdge<TMeta = CommandPayload> {
  readonly from: CommandNodeId;
  readonly to: CommandNodeId;
  readonly order: number;
  readonly latencyBudgetMs: number;
  readonly cost: number;
  readonly confidence: number;
  readonly payload?: TMeta;
}

export interface CommandWave {
  readonly id: CommandWaveId;
  readonly graphId: CommandGraphId;
  readonly title: string;
  readonly index: number;
  readonly commands: readonly CommandNode[];
  readonly dependsOn: readonly CommandWaveId[];
  readonly executionState: CommandExecutionState;
  readonly startedAt?: string;
  readonly endedAt?: string;
}

export interface CommandGraph {
  readonly id: CommandGraphId;
  readonly tenant: string;
  readonly runId: string;
  readonly rootPlanId: string;
  readonly nodes: readonly CommandNode[];
  readonly edges: readonly CommandEdge[];
  readonly waves: readonly CommandWave[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: {
    readonly source: 'planner' | 'planner-v2';
    readonly revision: number;
    readonly requestedBy: string;
    readonly notes: readonly string[];
  };
}

export interface CommandGraphEvent {
  readonly id: Brand<string, 'CommandGraphEventId'>;
  readonly graphId: CommandGraphId;
  readonly traceId: CommandTraceId;
  readonly eventType: 'node_added' | 'edge_added' | 'node_state_changed' | 'node_removed' | 'snapshot';
  readonly timestamp: string;
  readonly payload: CommandPayload;
}

export interface CommandGraphEnvelope<TSource = string> {
  readonly id: Brand<string, 'CommandGraphEnvelopeId'>;
  readonly source: TSource;
  readonly graph: CommandGraph;
  readonly events: readonly CommandGraphEvent[];
  readonly tags: readonly string[];
}

export interface CommandSynthesisCursor {
  readonly graphId: CommandGraphId;
  readonly index: number;
  readonly windowStart: string;
  readonly windowEnd: string;
}

export interface CommandSynthesisResult {
  readonly graphId: CommandGraphId;
  readonly ready: boolean;
  readonly conflicts: readonly string[];
  readonly criticalPaths: readonly CommandNodeId[];
  readonly readinessScore: number;
  readonly executionOrder: readonly CommandNodeId[];
  readonly forecastMinutes: number;
}

export interface CommandSynthesisPlan {
  readonly graphId: CommandGraphId;
  readonly planName: string;
  readonly runId: string;
  readonly waveCount: number;
  readonly requestedBy: string;
  readonly tenant: string;
  readonly snapshot: CommandSynthesisSnapshot;
  readonly query: CommandSynthesisQuery;
}

export interface CommandSynthesisSnapshot {
  readonly cursor: CommandSynthesisCursor;
  readonly generatedAt: string;
  readonly totalNodes: number;
  readonly blockedNodes: number;
  readonly riskScore: number;
  readonly criticalPathLength: number;
  readonly waveCoverage: number;
}

export interface CommandSynthesisQuery extends PageArgs {
  readonly tenant?: string;
  readonly graphId?: CommandGraphId;
  readonly readinessState?: CommandExecutionState;
  readonly minWeight?: number;
  readonly since?: string;
  readonly urgency?: CommandUrgency;
}

export interface CommandSynthesisRecord {
  readonly id: Brand<string, 'CommandSynthesisRecordId'>;
  readonly graphId: CommandGraphId;
  readonly planId: Brand<string, 'CommandPlanId'>;
  readonly runId: Brand<string, 'RecoveryRunId'>;
  readonly outcome: CommandSynthesisResult;
  readonly request: {
    readonly tenant: string;
    readonly operator: string;
    readonly reason: string;
  };
  readonly createdAt: string;
}

export interface CommandExecutionSample {
  readonly runId: Brand<string, 'RecoveryRunId'>;
  readonly graphId: CommandGraphId;
  readonly nodeId: CommandNodeId;
  readonly observedState: CommandExecutionState;
  readonly at: string;
  readonly latencyMs: number;
  readonly error?: string;
}

export interface CommandGraphPageResult extends PageResult<CommandGraph> {
  readonly page: number;
  readonly tenant: string;
}

const GraphIdSchema = z.string().min(1);
const NodeStateSchema = z.enum(['pending', 'active', 'deferred', 'blocked', 'resolved']);
const WeightSchema = z.number().min(0).max(1_000);
const EdgeOrderSchema = z.number().int().min(0).max(1_000);

export const commandNodeSchema = z.object({
  id: z.string().min(3),
  graphId: z.string().min(3),
  name: z.string().min(1),
  group: z.string().min(1),
  weight: z.number().min(0).max(1_000),
  severity: z.enum(['info', 'warning', 'critical']),
  urgency: z.enum(['low', 'medium', 'high']),
  state: NodeStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stateAt: z.string().datetime(),
  stateReason: z.string().optional(),
  version: z.number().int().min(0),
  metadata: z.object({
    owner: z.string().min(1),
    region: z.string().min(2),
    labels: z.array(z.string()),
    tags: z.array(z.string()),
    tagsVersion: z.number().int().min(0),
  }),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  stateWindow: z
    .object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    })
    .optional(),
});

export const commandEdgeSchema = z.object({
  from: z.string().min(3),
  to: z.string().min(3),
  order: EdgeOrderSchema,
  latencyBudgetMs: z.number().min(1).max(120_000),
  cost: z.number().min(0).max(1000),
  confidence: z.number().min(0).max(1),
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const commandGraphSchema = z.object({
  id: GraphIdSchema,
  tenant: z.string().min(2),
  runId: z.string().min(3),
  rootPlanId: z.string().min(3),
  nodes: z.array(commandNodeSchema),
  edges: z.array(commandEdgeSchema),
  waves: z.array(
    z.object({
      id: z.string().min(3),
      graphId: z.string().min(3),
      title: z.string().min(1),
      index: z.number().int().min(0),
      commands: z.array(commandNodeSchema),
      dependsOn: z.array(z.string()),
      executionState: z.enum(['queued', 'running', 'successful', 'failed', 'retry']),
      startedAt: z.string().datetime().optional(),
      endedAt: z.string().datetime().optional(),
    }),
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.object({
    source: z.enum(['planner', 'planner-v2']),
    revision: z.number().int().min(0),
    requestedBy: z.string().min(1),
    notes: z.array(z.string()),
  }),
});

export type CommandGraphParseResult = z.infer<typeof commandGraphSchema>;

const brandCommandGraph = (raw: CommandGraphParseResult): CommandGraph => ({
  id: withBrand(raw.id, 'CommandGraphId'),
  tenant: raw.tenant,
  runId: raw.runId,
  rootPlanId: raw.rootPlanId,
  nodes: raw.nodes.map((node) => ({
    id: withBrand(node.id, 'CommandNodeId'),
    graphId: withBrand(node.graphId, 'CommandGraphId'),
    name: node.name,
    group: node.group,
    weight: node.weight,
    severity: node.severity,
    urgency: node.urgency,
    state: node.state,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    stateAt: node.stateAt,
    stateReason: node.stateReason,
    version: node.version,
    metadata: node.metadata,
    attributes: node.attributes,
    stateWindow: node.stateWindow,
  })),
  edges: raw.edges.map((edge) => ({
    from: withBrand(edge.from, 'CommandNodeId'),
    to: withBrand(edge.to, 'CommandNodeId'),
    order: edge.order,
    latencyBudgetMs: edge.latencyBudgetMs,
    cost: edge.cost,
    confidence: edge.confidence,
    payload: edge.payload,
  })),
  waves: raw.waves.map((wave) => ({
    id: withBrand(wave.id, 'CommandWaveId'),
    graphId: withBrand(wave.graphId, 'CommandGraphId'),
    title: wave.title,
    index: wave.index,
    commands: wave.commands.map((node) => ({
      id: withBrand(node.id, 'CommandNodeId'),
      graphId: withBrand(node.graphId, 'CommandGraphId'),
      name: node.name,
      group: node.group,
      weight: node.weight,
      severity: node.severity,
      urgency: node.urgency,
      state: node.state,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      stateAt: node.stateAt,
      version: node.version,
      metadata: node.metadata,
    })),
    dependsOn: wave.dependsOn.map((id) => withBrand(id, 'CommandWaveId')),
    executionState: wave.executionState,
    startedAt: wave.startedAt,
    endedAt: wave.endedAt,
  })),
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  metadata: raw.metadata,
});

export const parseCommandGraph = (raw: unknown) => brandCommandGraph(commandGraphSchema.parse(raw) as CommandGraphParseResult);

export const buildNodeFingerprint = (graph: CommandGraph, node: CommandNode): string =>
  `${graph.id}/${graph.tenant}/${node.id}/${node.version}/${node.state}`;

export const buildGraphFingerprint = (graph: CommandGraph): string =>
  graph.nodes.map((node) => buildNodeFingerprint(graph, node)).join('|');

export const clampQuery = (query: CommandSynthesisQuery): { readonly limit: number; readonly query: CommandSynthesisQuery } => {
  const limit = normalizeLimit(query.limit);
  return {
    limit,
    query: {
      ...query,
      limit,
    },
  };
};

export const ensureGraphId = (tenant: string, runId: string): CommandGraphId =>
  withBrand(`${tenant}:${runId}:graph`, 'CommandGraphId');

export const ensureNodeId = (graphId: string, index: number, suffix: string): CommandNodeId =>
  withBrand(`${graphId}:node:${index}:${suffix}`, 'CommandNodeId');

export const ensureTraceId = (graphId: string, runId: string): CommandTraceId =>
  withBrand(`${graphId}:trace:${runId}`, 'CommandTraceId');

export const foldReadyNodes = <T>(nodes: readonly CommandNode[], reducer: AsyncReducer<CommandNode, T>, seed: T): Promise<T> => {
  return nodes.reduce<Promise<T>>(async (promise, node) => {
    const previous = await promise;
    const next = await reducer(previous, node, 0);
    return next;
  }, Promise.resolve(seed));
};

export const mapNodeStateHistory = (nodes: readonly CommandNode[]): readonly CommandNode[] =>
  nodes.toSorted((left, right) => {
    const order = left.group.localeCompare(right.group);
    if (order !== 0) return order;
    if (left.weight !== right.weight) return right.weight - left.weight;
    return left.state.localeCompare(right.state);
  });

export const extractPipeline = (nodes: readonly CommandNode[], mapper: AsyncMapper<CommandNode, string>) =>
  Promise.all(nodes.map((node) => mapper(node)));

export const summarizeNodeBySeverity = (nodes: readonly CommandNode[]) =>
  nodes.reduce<Record<CommandSeverity, number>>(
    (acc, node) => {
      const next = { ...acc };
      next[node.severity] += 1;
      return next;
    },
    { info: 0, warning: 0, critical: 0 },
  );
