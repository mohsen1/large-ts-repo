import { z } from 'zod';

import type { RecoveryProgram, RecoveryRunState, RecoveryStep } from './types';

export interface RecoveryExecutionSegment {
  readonly stepId: string;
  readonly command: string;
  readonly timeoutMs: number;
  readonly requiredApprovals: number;
}

export interface RecoveryExecutionPlan {
  readonly runId: RecoveryRunState['runId'];
  readonly sequence: readonly RecoveryExecutionSegment[];
  readonly batchSize: number;
  readonly estimatedMinutes: number;
  readonly canParallelize: boolean;
}

export interface RecoveryPlanOptions {
  readonly runId: RecoveryRunState['runId'];
  readonly program: RecoveryProgram;
  readonly includeFallbacks?: boolean;
}

const TopologyEdge = z.object({
  source: z.string(),
  target: z.string(),
});

const parseTopology = (topology: RecoveryProgram['topology']) =>
  TopologyEdge.array().parse(
    topology.rootServices.map((source, index) => ({ source, target: topology.fallbackServices[index] ?? source })),
  );

export const buildExecutionPlan = (options: RecoveryPlanOptions): RecoveryExecutionPlan => {
  const fallbackNodes = options.includeFallbacks ? [...options.program.topology.fallbackServices] : [];
  const ordered = topologicalOrderFromProgram(options.program.steps, parseTopology(options.program.topology));
  const sequence = ordered
    .filter((step) => options.includeFallbacks || !fallbackNodes.includes(step.id))
    .map((step) => ({
      stepId: step.id,
      command: step.command,
      timeoutMs: step.timeoutMs,
      requiredApprovals: step.requiredApprovals,
    }));
  const batchSize = Math.max(1, Math.min(3, sequence.length));
  const estimatedMinutes = Math.max(
    1,
    Math.ceil(sequence.reduce((sum, next) => sum + next.timeoutMs / 1000 / 60, 0)),
  );
  return {
    runId: options.runId,
    sequence,
    batchSize,
    estimatedMinutes,
    canParallelize: options.program.topology.rootServices.length > 1,
  };
};

const topologicalOrderFromProgram = (
  steps: readonly RecoveryStep[],
  fallbackRoots: readonly { source: string; target: string }[],
): readonly RecoveryStep[] => {
  const byId = new Map<string, RecoveryStep>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  for (const step of steps) {
    byId.set(step.id, step);
    inDegree.set(step.id, 0);
    if (!adjacency.has(step.id)) adjacency.set(step.id, new Set());
  }

  for (const edge of fallbackRoots) {
    const targetDependencies = byId.get(edge.target)?.dependencies ?? [];
    if (targetDependencies.length > 0) continue;
    const from = edge.source;
    const to = edge.target;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)!.add(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  for (const step of steps) {
    for (const dependency of step.dependencies) {
      if (!adjacency.has(dependency)) adjacency.set(dependency, new Set());
      adjacency.get(dependency)!.add(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue = steps.filter((step) => (inDegree.get(step.id) ?? 0) === 0).map((step) => step.id);
  const out: RecoveryStep[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = byId.get(currentId);
    if (current) out.push(current);
    const next = Array.from(adjacency.get(currentId) ?? []);
    for (const nextId of next) {
      const nextDegree = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        queue.push(nextId);
      }
    }
  }

  const remaining = steps.filter((step) => !out.includes(step));
  return [...out, ...remaining];
};
