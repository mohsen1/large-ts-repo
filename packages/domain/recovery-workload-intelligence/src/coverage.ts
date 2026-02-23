import type { IncidentRiskVector, WorkloadDependencyGraph, WorkloadSnapshot, WorkloadUnitId } from './types';
import { evaluateRiskScore } from './risk';

export interface SloBand {
  readonly name: string;
  readonly min: number;
  readonly max: number;
}

export interface CoverageWindow {
  readonly from: string;
  readonly to: string;
  readonly bucket: string;
  readonly coverage: number;
  readonly riskProfile: ReturnType<typeof evaluateRiskScore>;
}

export interface CoverageReport {
  readonly overall: number;
  readonly breakdown: readonly CoverageWindow[];
  readonly hotNodes: readonly WorkloadUnitId[];
  readonly criticalClass: 'low' | 'medium' | 'high' | 'critical';
}

const SLO_BANDS: readonly SloBand[] = [
  { name: 'strict', min: 0.9, max: 1 },
  { name: 'normal', min: 0.75, max: 0.9 },
  { name: 'weak', min: 0.5, max: 0.75 },
  { name: 'unsafe', min: 0, max: 0.5 },
];

const scoreBucket = (coverage: number): string => {
  const band = SLO_BANDS.find((entry) => coverage >= entry.min && coverage <= entry.max);
  return band ? band.name : 'unsafe';
};

const estimateWindowRiskVector = (snapshot: WorkloadSnapshot): IncidentRiskVector => ({
  severity: snapshot.errorRate > 40 ? 5 : snapshot.errorRate > 20 ? 4 : snapshot.cpuUtilization > 90 ? 3 : 2,
  blastRadius: snapshot.errorRate > 30 ? 'global' : snapshot.cpuUtilization > 85 ? 'region' : 'zone',
  customerImpact: Math.max(1, Math.round(snapshot.cpuUtilization + snapshot.errorRate)),
  recoveryToleranceSeconds: Math.max(60, Math.round(snapshot.throughput)),
});

export const calculateCoverageForWindow = (
  graph: WorkloadDependencyGraph,
  snapshots: readonly WorkloadSnapshot[],
): CoverageReport => {
  if (graph.nodes.length === 0) {
    return {
      overall: 0,
      breakdown: [],
      hotNodes: [],
      criticalClass: 'critical',
    };
  }
  if (snapshots.length === 0) {
    return {
      overall: 1,
      breakdown: [],
      hotNodes: [],
      criticalClass: 'low',
    };
  }
  const sorted = [...snapshots].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const breakdown: CoverageWindow[] = [];
  const hotNodes = new Set<WorkloadUnitId>();
  let index = 0;
  const stride = Math.max(1, Math.floor(sorted.length / 8));
  const nodesById = new Map<WorkloadUnitId, { riskMax: number; count: number }>();

  while (index < sorted.length) {
    const window = sorted.slice(index, index + stride);
    index += stride;
    if (window.length === 0) {
      continue;
    }
    const coverage = 1 - (window.reduce((acc, snapshot) => acc + snapshot.errorRate, 0) / (window.length * 100));
    const safeCoverage = Math.max(0, Math.min(1, coverage));
    const median = window[Math.floor(window.length / 2)] ?? window[0];
    if (!median) {
      continue;
    }
    const risk = evaluateRiskScore(median, estimateWindowRiskVector(median));
    const nodeRisk = { riskMax: risk.riskScore, count: 1 };
    nodesById.set(median.nodeId, nodeRisk);
    if (risk.riskScore > 0.65) {
      hotNodes.add(median.nodeId);
    }
    breakdown.push({
      from: window[0]?.timestamp ?? median.timestamp,
      to: window.at(-1)?.timestamp ?? median.timestamp,
      bucket: scoreBucket(safeCoverage),
      coverage: safeCoverage,
      riskProfile: risk,
    });
  }

  const overall = breakdown.length === 0
    ? 0
    : breakdown.reduce((acc, entry) => acc + entry.coverage, 0) / breakdown.length;
  const maxRisk = [...nodesById.values()].reduce((acc, current) => Math.max(acc, current.riskMax), 0);
  const criticalClass: CoverageReport['criticalClass'] = maxRisk >= 0.85 ? 'critical' : maxRisk >= 0.65 ? 'high' : maxRisk >= 0.35 ? 'medium' : 'low';
  return {
    overall,
    breakdown,
    hotNodes: [...hotNodes],
    criticalClass,
  };
};
