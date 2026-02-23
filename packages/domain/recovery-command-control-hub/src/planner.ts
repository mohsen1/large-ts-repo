import { brandRunId, emptySummary, makeNode, type HubDraft, type HubDraftInput, type HubExecution, type HubNode, type HubSummary, type HubRun, type HubControlWindow, type HubCheckpoint, type HubNodeId, type ImpactBand, type CommandState } from './types';
import { addDependency, buildTopology } from './graph';
import { createControlWindow } from './schedule';
import { inferPosture } from './risk';

export interface PlanDraftInput {
  readonly tenantId: string;
  readonly nodes: readonly HubDraftInput[];
}

export interface DraftResult {
  readonly draft: HubDraft;
  readonly order: readonly HubNode[];
  readonly summary: HubSummary;
}

export const makeDraft = (input: PlanDraftInput): DraftResult => {
  const tenantId = input.tenantId.toLowerCase();
  const nodes = input.nodes.map((raw) => makeNode({ ...raw, tenantId }));
  const topology = buildTopology(nodes);
  const summary = summarize(nodes, topology.edges.length);

  const draft: HubDraft = {
    tenantId: nodes[0]?.tenantId ?? (tenantId as unknown as HubDraft['tenantId']),
    nodes,
    topology,
    summary,
  };

  const order = topology.nodeIds
    .map((nodeId: HubNodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is HubNode => node !== undefined);

  return { draft, order, summary };
};

export const withDependency = (draft: HubDraft, from: HubNodeId, to: HubNodeId, reason: string): HubDraft => {
  const topology = addDependency(draft.topology, from, to, reason);
  const summary = summarize(draft.nodes, topology.edges.length);
  return {
    ...draft,
    topology,
    summary,
  };
};

const summarize = (nodes: readonly HubNode[], blockedCount: number): HubSummary => {
  const byState: Record<CommandState, number> = {
    queued: 0,
    scheduled: 0,
    executing: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  };
  const byBand: Record<ImpactBand, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const node of nodes) {
    byState[node.state] = byState[node.state] + 1;
    byBand[node.impactBand] = byBand[node.impactBand] + 1;
  }

  return {
    ...emptySummary(),
    runCount: 1,
    totalNodes: nodes.length,
    byState,
    byBand,
    totalDurationMs: nodes.reduce((acc, node) => acc + node.estimatedDurationMs, 0),
    blockedNodeCount: blockedCount,
  };
};

export const buildExecution = (draft: DraftResult): HubExecution => {
  const run: HubRun = {
    runId: brandRunId(`exec-${Date.now()}`),
    tenantId: draft.draft.tenantId,
    topology: draft.draft.topology,
    state: 'queued',
    riskScore: draft.summary.totalDurationMs / 1000,
    posture: inferPosture(draft.summary),
    createdAt: new Date().toISOString(),
  };

  const checkpoints: HubCheckpoint[] = draft.order.map((node, index) => ({
    key: `${run.runId}:${index}`,
    nodeId: node.id,
    state: index === 0 ? 'queued' : 'scheduled',
    at: new Date(Date.now() + index * 300).toISOString(),
    detail: `checkpoint for ${node.commandName}`,
  }));

  const controlWindow: HubControlWindow = createControlWindow(run.runId, new Date().toISOString(), 120);

  return {
    run,
    checkpoints,
    blocked: draft.draft.topology.edges
      .filter((edge) => edge.latencyMs > 800)
      .map((edge) => edge.to),
    operatorNotes: ['draft bootstrapped', `nodes=${draft.order.length}`],
    controlWindow,
  };
};

export const rebaseDraft = (draft: HubDraft, updates: HubDraftInput[]): HubDraft => {
  const nodes = updates.map((item) => makeNode(item));
  const topology = buildTopology(nodes);
  return {
    ...draft,
    nodes,
    topology,
    summary: summarize(nodes, topology.edges.length),
  };
};
