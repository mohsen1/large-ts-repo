import type { CommandMetric, CommandNode, CommandSequence, CommandWindowState, CommandStudioCommandId, CommandStudioWorkspaceId } from './types';

export const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const average = (values: readonly number[]): number => {
  if (!values.length) return 0;
  const total = values.reduce((sum, item) => sum + item, 0);
  return total / values.length;
};

export const metricKey = (commandId: CommandStudioCommandId): string => `${commandId}-metric`;

export const isTerminalState = (state: CommandWindowState): boolean => state === 'complete' || state === 'failed';

export const byWorkspace = <T extends { readonly workspaceId: CommandStudioWorkspaceId }>(items: readonly T[]) =>
  items.reduce((acc, item) => {
    const existing = acc.get(item.workspaceId) ?? [];
    acc.set(item.workspaceId, [...existing, item]);
    return acc;
  }, new Map<string, T[]>());

export const buildThroughput = (nodes: readonly CommandNode[], completedNodeIds: readonly CommandStudioCommandId[]) => {
  if (!nodes.length) return 0;
  const completeNodes = nodes.filter((node) => completedNodeIds.includes(node.id)).length;
  return completeNodes / nodes.length;
};

export const deriveReadiness = (sequence: CommandSequence, metrics: readonly CommandMetric[]): number => {
  if (!sequence.nodes.length) return 0;

  const readinessSignals = metrics.filter((metric) => metric.unit === 'percent');
  const totalWeight = readinessSignals.reduce((sum, entry) => sum + entry.value, 0);
  const score = totalWeight / Math.max(1, sequence.nodes.length);
  return clamp01(score / 100);
};
