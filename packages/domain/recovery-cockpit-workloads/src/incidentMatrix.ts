import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildWorkloadTopology } from './topology';
import { ServiceTopologyNode } from './topology';
import { UtcIsoTimestamp, toTimestamp } from '@domain/recovery-cockpit-models';

export type IncidentSeverity = 'minimal' | 'minor' | 'major' | 'critical';

export type IncidentMatrixCell = {
  readonly serviceCode: string;
  readonly region: string;
  readonly severity: IncidentSeverity;
  readonly actionCount: number;
  readonly topologies: readonly string[];
  readonly recoveryRisk: number;
};

export type IncidentMatrix = {
  readonly planId: string;
  readonly generatedAt: UtcIsoTimestamp;
  readonly namespace: string;
  readonly cells: readonly IncidentMatrixCell[];
  readonly summary: {
    readonly criticalCount: number;
    readonly majorCount: number;
    readonly avgRisk: number;
  };
};

const riskFromNode = (node: ServiceTopologyNode): number => {
  const critical = node.criticality === 'critical' ? 80 : node.criticality === 'high' ? 60 : node.criticality === 'medium' ? 40 : 20;
  const dependencyRisk = node.dependencies.length * 6;
  return Math.min(100, critical + dependencyRisk);
};

const toSeverity = (risk: number): IncidentSeverity => {
  if (risk >= 85) return 'critical';
  if (risk >= 65) return 'major';
  if (risk >= 45) return 'minor';
  return 'minimal';
};

const summarizeRows = (cells: readonly IncidentMatrixCell[]) => {
  const criticalCount = cells.filter((cell) => cell.severity === 'critical').length;
  const majorCount = cells.filter((cell) => cell.severity === 'major').length;
  const avgRisk = cells.length === 0 ? 0 : Number((cells.reduce((acc, cell) => acc + cell.recoveryRisk, 0) / cells.length).toFixed(2));
  return { criticalCount, majorCount, avgRisk };
};

export const buildIncidentMatrix = (plan: RecoveryPlan): IncidentMatrix => {
  const topology = buildWorkloadTopology(plan, plan.labels.short);
  const mapped: IncidentMatrixCell[] = topology.nodes.map((node) => {
    const risk = riskFromNode(node);
    return {
      serviceCode: node.serviceCode,
      region: String(node.region),
      severity: toSeverity(risk),
      actionCount: node.actionCount,
      topologies: [...node.topologies],
      recoveryRisk: risk,
    };
  });

  return {
    planId: plan.planId,
    generatedAt: toTimestamp(new Date()),
    namespace: topology.namespace,
    cells: mapped,
    summary: summarizeRows(mapped),
  };
};

export const rankIncidentCells = (matrix: IncidentMatrix): readonly IncidentMatrixCell[] =>
  [...matrix.cells].sort((left, right) => right.recoveryRisk - left.recoveryRisk);

export const topCriticalNodes = (matrix: IncidentMatrix, max = 5): readonly IncidentMatrixCell[] =>
  rankIncidentCells(matrix).filter((cell) => cell.severity === 'critical' || cell.severity === 'major').slice(0, max);

export const toIncidentCsv = (matrix: IncidentMatrix): string =>
  matrix.cells
    .map((cell) => `${cell.serviceCode},${cell.region},${cell.severity},${cell.actionCount},${cell.recoveryRisk}`)
    .join('\n');

export const flattenIncidents = (matrix: IncidentMatrix): readonly string[] =>
  matrix.cells.map((cell) => `${cell.region}:${cell.serviceCode}:${cell.severity}`);
