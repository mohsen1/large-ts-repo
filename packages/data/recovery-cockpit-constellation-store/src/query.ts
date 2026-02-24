import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import type { RecoveryPlan } from '@domain/recovery-cockpit-models';
import {
  buildConstellationTimestamp,
  type ConstellationPlanEnvelope,
  newTemplateId,
  newNodeId,
  type ConstellationMode,
  type ConstellationNode,
  type ConstellationNodeId,
  type ConstellationRunId,
  type ConstellationTopology,
} from '@domain/recovery-cockpit-constellation-core';
import type { ConstellationRunSnapshot, ConstellationRunQuery, ReplayCursor } from './types';
import type { InMemoryConstellationRunStore } from './store';

export type RunSelector<K extends string = string> = {
  readonly values: readonly K[];
};

export type ScoreRow = {
  readonly runId: ConstellationRunId;
  readonly score: number;
  readonly mode: ConstellationMode;
};

export type TopologyDigest = {
  readonly totalNodes: number;
  readonly totalEdges: number;
  readonly score: number;
};

const toRunSelector = (query: ConstellationRunQuery): RunSelector<ConstellationRunId> => ({
  values: query.runIds ?? [],
});

const toScoreRow = (snapshot: ConstellationRunSnapshot): ScoreRow => ({
  runId: snapshot.runId,
  score: snapshot.plan.slaMinutes,
  mode: snapshot.mode,
});

export const readNodesFromSnapshot = (snapshot: ConstellationRunSnapshot): readonly ConstellationNodeId[] =>
  snapshot.topologyNodes.map((node) => node.nodeId);

const buildTopologyFromPlan = (plan: RecoveryPlan): ConstellationTopology => ({
  nodes: plan.actions.map((action, index) => ({
    nodeId: newNodeId(action.id),
    label: action.command,
    stage: index % 2 === 0 ? 'simulate' : 'execute',
    actionCount: action.expectedDurationMinutes,
    criticality: action.retriesAllowed + action.dependencies.length,
  })),
  edges: plan.actions.flatMap((action, index) => {
    const upstream = plan.actions[index - 1];
    return upstream ? [{ from: newNodeId(upstream.id), to: newNodeId(action.id) }] : [];
  }),
});

export const createPlanEnvelope = (plan: RecoveryPlan, topology: ConstellationTopology) => ({
  id: newTemplateId(`${plan.planId}::${topology.nodes.length}`),
  plan,
  createdAt: buildConstellationTimestamp(),
  mode: plan.mode === 'automated'
    ? 'execution'
    : plan.mode === 'manual'
      ? 'analysis'
      : 'simulation',
  stages: topology.nodes.length === 0
    ? ['validate']
    : ['bootstrap', 'ingest', 'synthesize', 'validate', 'simulate', 'execute', 'recover', 'sweep'],
}) satisfies ConstellationPlanEnvelope;

export const planToTopology = (plan: RecoveryPlan): ConstellationTopology => buildTopologyFromPlan(plan);

export const latestByMode = async (
  store: InMemoryConstellationRunStore,
  query: NoInfer<ConstellationRunQuery> = {},
): Promise<Result<ScoreRow | undefined, string>> => {
  const list = await store.list(query);
  if (!list.ok) return fail(list.error);
  const sorted = list.value.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const rows = sorted.map(toScoreRow);
  return ok(rows[0]);
};

export const queryByMode = async (
  store: InMemoryConstellationRunStore,
  mode: NoInfer<ConstellationMode>,
): Promise<Result<readonly ConstellationRunSnapshot[], string>> => {
  const list = await store.list({ mode });
  if (!list.ok) return fail(list.error);
  return ok(list.value);
};

export const queryModeBuckets = async (
  store: InMemoryConstellationRunStore,
  query: NoInfer<ConstellationRunQuery> = {},
): Promise<Result<Record<ConstellationMode, readonly ConstellationRunId[]>, string>> => {
  const list = await store.list(query);
  if (!list.ok) return fail(list.error);
  const selector = toRunSelector(query);
  const entries = list.value.reduce<Record<ConstellationMode, readonly ConstellationRunId[]>>(
    (acc, snapshot) => ({
      ...acc,
      [snapshot.mode]: [...(acc[snapshot.mode] ?? []), snapshot.runId],
    }),
    {
      analysis: [],
      simulation: [],
      execution: [],
      stabilization: [],
    },
  );

  if (selector.values.length === 0) {
    return ok(entries);
  }

  const filteredBuckets = {
    analysis: entries.analysis.filter((runId) => selector.values.some((value) => value === runId)),
    simulation: entries.simulation.filter((runId) => selector.values.some((value) => value === runId)),
    execution: entries.execution.filter((runId) => selector.values.some((value) => value === runId)),
    stabilization: entries.stabilization.filter((runId) => selector.values.some((value) => value === runId)),
  };

  return ok(filteredBuckets);
};

const dedupe = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

export const distinctModes = (values: readonly ConstellationRunSnapshot[]): readonly ConstellationMode[] =>
  dedupe(values.map((entry) => entry.mode)).toSorted();

export const topologyDigest = (
  plan: RecoveryPlan,
): TopologyDigest => {
  const topology = planToTopology(plan);
  const score = topology.nodes.reduce((acc, node) => acc + node.actionCount * node.criticality, 0);
  return {
    totalNodes: topology.nodes.length,
    totalEdges: topology.edges.length,
    score,
  };
};

export const pageByMode = (
  rows: readonly ConstellationRunSnapshot[],
  pageSize: number,
): readonly ReplayCursor<ConstellationRunSnapshot>[] => {
  if (rows.length === 0 || pageSize <= 0) {
    return [];
  }
  const buckets = Math.ceil(rows.length / pageSize);
  return Array.from({ length: buckets }, (_, index) => {
    const start = index * pageSize;
    const data = rows.slice(start, start + pageSize);
    return {
      index,
      pageSize: data.length,
      data,
    };
  });
};

export const buildRunTopology = (nodes: readonly ConstellationNode[], _mode: ConstellationMode): ConstellationTopology => ({
  nodes,
  edges: nodes.toReversed().flatMap((node, index, ordered) => {
    const previous = ordered[index - 1];
    return previous ? [{ from: previous.nodeId, to: node.nodeId }] : [];
  }),
});
