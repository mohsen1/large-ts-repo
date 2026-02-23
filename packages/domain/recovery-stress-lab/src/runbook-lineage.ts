import { normalizeLimit } from '@shared/core';
import {
  CommandRunbook,
  CommandStep,
  CommandStepId,
  WorkloadId,
  SeverityBand,
  createStepId,
} from './models';

export interface LineageStep {
  readonly runbookId: CommandRunbook['id'];
  readonly stepId: CommandStepId;
  readonly phase: CommandStep['phase'];
  readonly title: string;
  readonly prerequisites: readonly CommandStepId[];
  readonly requiredSignals: readonly string[];
}

export interface LineageNode {
  readonly nodeId: WorkloadId;
  readonly runbookId: CommandRunbook['id'];
  readonly level: number;
  readonly outgoing: readonly LineageStep[];
}

export interface LineageSummary {
  readonly tenantId: string;
  readonly depth: number;
  readonly edgeCount: number;
  readonly cycleRisk: boolean;
  readonly nodes: readonly LineageNode[];
}

export interface LineageInput {
  readonly tenantId: string;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
}

const normalizeStepId = (stepId: CommandStepId): CommandStepId => {
  return stepId && String(stepId).trim().length > 0
    ? stepId
    : createStepId('lineage-step');
};

const stableIndex = (left: WorkloadId, right: WorkloadId): number => String(left).localeCompare(String(right));

const buildSteps = (runbook: CommandRunbook, allStepIds: Set<string>): LineageStep[] => {
  const out: LineageStep[] = [];
  for (const step of runbook.steps) {
    const normalizedStepId = normalizeStepId(step.commandId);
    allStepIds.add(String(normalizedStepId));
    out.push({
      runbookId: runbook.id,
      stepId: normalizedStepId,
      phase: step.phase,
      title: step.title,
      prerequisites: [...step.prerequisites],
      requiredSignals: step.requiredSignals.map((signalId) => String(signalId)),
    });
  }
  return out;
};

const byRunbook = (runbooks: readonly CommandRunbook[]): Map<CommandRunbook['id'], CommandRunbook> => {
  const map = new Map<CommandRunbook['id'], CommandRunbook>();
  for (const runbook of runbooks) {
    map.set(runbook.id, runbook);
  }
  return map;
};

const buildDependencyEdges = (steps: readonly LineageStep[]): Map<string, string[]> => {
  const edges = new Map<string, string[]>();
  for (const step of steps) {
    edges.set(String(step.stepId), [...step.prerequisites.map((dependency) => String(dependency)), ...[]]);
  }
  return edges;
};

const detectCycle = (edges: Map<string, string[]>): boolean => {
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of edges.get(node) ?? []) {
      if (dfs(child)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of edges.keys()) {
    if (dfs(node)) return true;
  }
  return false;
};

export const buildRunbookLineage = (input: LineageInput): LineageSummary => {
  const lookup = byRunbook(input.runbooks);
  const allStepIds = new Set<string>();
  const lineageStepsByRunbook = new Map<CommandRunbook['id'], LineageStep[]>();

  const allSteps: LineageStep[] = [];
  for (const runbook of lookup.values()) {
    const mapped = buildSteps(runbook, allStepIds);
    allSteps.push(...mapped);
    lineageStepsByRunbook.set(runbook.id, mapped);
  }

  const edges = buildDependencyEdges(allSteps);
  const cycleRisk = detectCycle(edges);
  const nodes: LineageNode[] = [];

  let cursor = 0;
  for (const [runbookId, lines] of lineageStepsByRunbook.entries()) {
    const workloadId = (`workload-${runbookId}` as unknown) as WorkloadId;
    const level = Math.max(0, Math.min(10, normalizeLimit(lines.length + cursor)));
    nodes.push({
      nodeId: workloadId,
      runbookId,
      level,
      outgoing: lines,
    });
    cursor += 1;
  }

  return {
    tenantId: input.tenantId,
    depth: nodes.length > 0 ? Math.max(...nodes.map((node) => node.level), 0) : 0,
    edgeCount: [...edges.values()].reduce((sum, list) => sum + list.length, 0),
    cycleRisk,
    nodes: nodes.sort((left, right) => stableIndex(left.nodeId, right.nodeId)),
  };
};

export const buildLineageDigest = (input: LineageSummary): ReadonlyArray<string> => {
  return [
    `tenant=${input.tenantId}`,
    `depth=${input.depth}`,
    `edges=${input.edgeCount}`,
    `cycleRisk=${input.cycleRisk}`,
    `nodes=${input.nodes.length}`,
  ];
};

export const findEntryCandidates = (input: LineageSummary): readonly CommandRunbook['id'][] => {
  const candidates = input.nodes
    .filter((node) => node.level === 0 || node.level === 1)
    .map((node) => node.runbookId);
  return candidates.length === 0 ? input.nodes.map((node) => node.runbookId).slice(0, 3) : candidates;
};

