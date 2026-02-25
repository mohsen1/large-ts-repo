import type { CommandShape, WorkspaceBlueprint, CommandDependencyEdge, WorkspaceMetrics } from './models';

export interface WorkspaceInsight {
  readonly score: number;
  readonly risk: 'low' | 'medium' | 'high';
  readonly bottlenecks: readonly string[];
}

export const countBySeverity = (commands: readonly CommandShape[]): {
  readonly p0: number;
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
} => ({
  p0: commands.filter((entry) => entry.severity === 'p0').length,
  p1: commands.filter((entry) => entry.severity === 'p1').length,
  p2: commands.filter((entry) => entry.severity === 'p2').length,
  p3: commands.filter((entry) => entry.severity === 'p3').length,
});

export const scoreBySeverity = (commands: readonly CommandShape[]): number => {
  const counts = countBySeverity(commands);
  const total = commands.length;
  if (!total) {
    return 0;
  }
  const value = (counts.p0 * 4 + counts.p1 * 2 + counts.p2 + counts.p3) / (total * 4);
  return Math.min(1, Math.max(0, value));
};

export const bottleneckNodes = (edges: readonly CommandDependencyEdge[]): readonly string[] => {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(String(edge.from), (counts.get(String(edge.from)) ?? 0) + 1);
    counts.set(String(edge.to), (counts.get(String(edge.to)) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([value]) => value);
};

export const summarizeBlueprint = (blueprint: WorkspaceBlueprint): WorkspaceInsight => {
  const commandShapes = blueprint.commandOrder.map((id, index) => {
    const severity: CommandShape['severity'] = index % 3 === 0 ? 'p0' : index % 3 === 1 ? 'p1' : 'p2';
    return {
      id,
      title: `command-${index}`,
      severity,
      payload: {},
      createdAt: new Date().toISOString(),
    } satisfies CommandShape;
  });

  const score = scoreBySeverity(commandShapes);
  return {
    score,
    risk: score >= 0.75 ? 'low' : score >= 0.5 ? 'medium' : 'high',
    bottlenecks: bottleneckNodes(blueprint.graph),
  };
};

export const defaultMetrics = (input: Partial<WorkspaceMetrics>): WorkspaceMetrics => ({
  commandCount: input.commandCount ?? 0,
  criticalCount: input.criticalCount ?? 0,
  replayRatio: input.replayRatio ?? 0,
  latencyBudgetMs: input.latencyBudgetMs ?? 500,
});
