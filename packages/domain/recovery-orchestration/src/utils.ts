import { Optionalize } from '@shared/type-level';

import type {
  RecoveryCheckpoint,
  RecoveryProgramProjection,
  RecoveryProgram,
  RecoveryRunState,
  RecoveryStep,
  RunTopologyGraph,
} from './types';

const toFinite = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

export const createRecoveryRunState = (params: {
  runId: string;
  programId: string;
  incidentId: string;
  estimatedRecoveryTimeMinutes?: number;
}): RecoveryRunState => ({
  runId: params.runId as any,
  programId: params.programId as any,
  incidentId: params.incidentId as any,
  status: 'staging',
  estimatedRecoveryTimeMinutes: toFinite(params.estimatedRecoveryTimeMinutes, 15),
});

const buildDependencyEdges = (steps: readonly RecoveryStep[]): RunTopologyGraph => {
  const edges = new Map<string, Set<string>>();
  const entryCandidates = new Set<string>(steps.map((step) => step.id));

  for (const step of steps) {
    if (!edges.has(step.id)) edges.set(step.id, new Set());
    for (const required of step.dependencies) {
      entryCandidates.delete(step.id);
      if (!edges.has(required)) edges.set(required, new Set());
      edges.get(required)!.add(step.id);
    }
  }

  const entryPoints = Array.from(entryCandidates);
  const all = new Set<string>(steps.map((step) => step.id));
  const exitPoints = Array.from(all).filter((id) => {
    return !Array.from(edges.values()).some((targets) => targets.has(id));
  });

  return {
    edges: Object.fromEntries(Array.from(edges.entries()).map(([id, targets]) => [id, [...targets]])),
    entryPoints,
    exitPoints,
  };
};

export const summarizeProgram = (program: RecoveryProgram): RecoveryProgramProjection => ({
  id: program.id,
  name: program.name,
  priority: program.priority,
  mode: program.mode,
  serviceCount: program.topology.rootServices.length + program.topology.fallbackServices.length,
  stepCount: program.steps.length,
  hasBlockingConstraints: program.constraints.some((constraint) => constraint.threshold > 0.5),
});

export const isRunRecoverable = (
  run: RecoveryRunState,
  recentCheckpoints: readonly RecoveryCheckpoint[]
) => {
  const latest = recentCheckpoints
    .filter((checkpoint) => checkpoint.runId === run.runId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  if (!latest) return false;
  if (latest.exitCode === 0 && latest.status !== 'failed') return true;
  if (latest.exitCode >= 0 && latest.exitCode <= 1) return true;
  return false;
};

export const calculateRecoveryWindowMinutes = (program: RecoveryProgram): number => {
  const windowStart = Date.parse(program.window.startsAt);
  const windowEnd = Date.parse(program.window.endsAt);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return 0;
  const diffMinutes = (windowEnd - windowStart) / 60000;
  return Math.max(0, Math.floor(diffMinutes));
};

export const normalizeProgram = (program: Optionalize<RecoveryProgram, 'updatedAt'>): RecoveryProgram => ({
  ...program,
  steps: program.steps.map((step: RecoveryStep) => ({
    ...step,
    timeoutMs: Math.max(100, Math.floor(step.timeoutMs)),
    tags: [...new Set(step.tags)],
    dependencies: [...new Set(step.dependencies)],
    requiredApprovals: Math.max(0, Math.floor(step.requiredApprovals)),
  })),
  constraints: [...program.constraints].sort((a, b) => a.name.localeCompare(b.name)),
  tags: [...new Set(program.tags)],
  createdAt: program.createdAt ?? new Date().toISOString(),
  updatedAt: program.updatedAt ?? new Date().toISOString(),
});

export const topologicalOrder = (program: RecoveryProgram): readonly string[] => {
  const graph = buildDependencyEdges(program.steps);
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const output: string[] = [];
  const adjacency = graph.edges;

  for (const id of Object.keys(adjacency)) {
    inDegree.set(id, 0);
  }
  for (const targets of Object.values(adjacency)) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id);
  }

  while (queue.length) {
    const current = queue.shift()!;
    output.push(current);
    for (const next of adjacency[current] ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  const missing = Object.keys(adjacency).filter((id) => !output.includes(id));
  output.push(...missing);
  return output;
};
