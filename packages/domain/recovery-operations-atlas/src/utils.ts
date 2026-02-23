import {
  type RecoveryAtlasNode,
  type RecoveryAtlasFilter,
  type Severity,
  type DriftState,
  type RecoveryAtlasRunReport,
  type RecoveryAtlasTelemetryEvent,
  type RecoveryAtlasPlanId,
} from './types';

export type NodeSelector<T extends RecoveryAtlasNode = RecoveryAtlasNode> = (node: T) => boolean;

const severityRank: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const driftRank: Record<DriftState, number> = {
  stable: 1,
  degraded: 2,
  disruptive: 3,
  critical: 4,
};

export const createNodeId = (value: string): RecoveryAtlasNode['id'] => value as RecoveryAtlasNode['id'];
export const createPlanId = (value: string): RecoveryAtlasPlanId => value as RecoveryAtlasPlanId;

export const compareSeverity = (left: Severity, right: Severity): number => {
  const diff = severityRank[left] - severityRank[right];
  return Math.sign(diff);
};

export const selectNodes = <T extends RecoveryAtlasNode>(nodes: readonly T[], selector: NodeSelector<T>): readonly T[] => {
  return nodes.filter(selector);
};

export const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const normalizeScore = (value: number): number => {
  return clamp(Math.round(value * 100) / 100, 0, 100);
};

export const toDriftScore = (state: DriftState): number => {
  return driftRank[state] * 25;
};

export const calculateNodeRisk = (node: RecoveryAtlasNode): number => {
  const severity = severityRank[node.severity] * 8;
  const drift = toDriftScore(node.driftState);
  const ownerPenalty = node.ownerTeam === 'platform' ? 5 : 0;
  return normalizeScore(severity + drift + ownerPenalty - node.recoveredBySlaMinutes);
};

export const matchSeverity = (node: RecoveryAtlasNode, filter: RecoveryAtlasFilter): boolean => {
  if (!filter.severity) return true;
  const allowed = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
  return allowed.includes(node.severity);
};

export const matchEnvironment = (node: RecoveryAtlasNode, filter: RecoveryAtlasFilter): boolean => {
  if (!filter.environment) return true;
  const allowed = Array.isArray(filter.environment) ? filter.environment : [filter.environment];
  return allowed.includes(node.environment);
};

export const matchComponentPrefix = (node: RecoveryAtlasNode, filter: RecoveryAtlasFilter): boolean => {
  if (!filter.componentPrefix) return true;
  return node.component.startsWith(filter.componentPrefix);
};

export const matchRegion = (node: RecoveryAtlasNode, filter: RecoveryAtlasFilter): boolean => {
  if (!filter.region) return true;
  return node.region === filter.region;
};

export const filterNodes = (nodes: readonly RecoveryAtlasNode[], filter: RecoveryAtlasFilter): readonly RecoveryAtlasNode[] => {
  return nodes.filter((node) => {
    const passes = [
      matchSeverity(node, filter),
      matchEnvironment(node, filter),
      matchComponentPrefix(node, filter),
      matchRegion(node, filter),
    ];
    return passes.every(Boolean);
  });
};

export const rankByRisk = (nodes: readonly RecoveryAtlasNode[]): readonly RecoveryAtlasNode[] => {
  return [...nodes].sort(
    (left, right) => compareSeverity(right.severity, left.severity) || right.recoveredBySlaMinutes - left.recoveredBySlaMinutes,
  );
};

export const eventStreamSignature = (events: readonly RecoveryAtlasTelemetryEvent[]): string => {
  return events
    .map((event) => `${event.type}:${event.severity}:${event.at}`)
    .join('|');
};

export const deriveReportHealth = (report: RecoveryAtlasRunReport): 'healthy' | 'degraded' | 'failed' => {
  if (!report.passed) return 'failed';
  if (report.failedSteps > 0) return 'degraded';
  return 'healthy';
};

export const formatNodeLabel = (node: RecoveryAtlasNode): string => {
  return `${node.component}@${node.region} [${node.environment}]`;
};
