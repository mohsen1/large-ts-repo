import { z } from 'zod';
import { AdaptiveRun, AdaptivePolicy, AdaptiveDecision, SignalSample, AdaptiveAction } from './types';

export interface RunHealthMetric {
  runId: string;
  tenantId: string;
  signalCoverage: number;
  topRisk: AdaptiveDecision['risk'];
  decisionDensity: number;
  conflictCount: number;
  score: number;
}

export interface TelemetryWindow {
  tenantId: string;
  start: string;
  end: string;
  timezone: string;
}

export interface SignalStats<T extends string = string> {
  kind: T;
  min: number;
  max: number;
  avg: number;
  p95: number;
  count: number;
}

export interface RunSignalDigest {
  runId: string;
  policyCount: number;
  decisionCount: number;
  actionCount: number;
  hotspots: readonly string[];
}

const telemetryInputSchema = z.object({
  tenantId: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string().min(1),
  minActionCount: z.number().int().nonnegative(),
});

export type TelemetryQuery = z.infer<typeof telemetryInputSchema>;

export const parseTelemetryQuery = (value: unknown): TelemetryQuery => telemetryInputSchema.parse(value);

const calculateP = (values: readonly number[], percentile: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const clamped = Math.min(Math.max(percentile, 0), 100);
  const index = Math.floor((sorted.length - 1) * (clamped / 100));
  return sorted[index];
};

export const digestSignals = (signals: readonly SignalSample[]): readonly SignalStats[] => {
  const byKind = new Map<string, number[]>();
  for (const signal of signals) {
    const existing = byKind.get(signal.kind) ?? [];
    existing.push(signal.value);
    byKind.set(signal.kind, existing);
  }

  return Array.from(byKind.entries()).map(([kind, values]) => {
    const sorted = [...values];
    const min = Math.min(...sorted);
    const max = Math.max(...sorted);
    const avg = sorted.reduce((acc, value) => acc + value, 0) / sorted.length;
    const p95 = calculateP(sorted, 95);
    return { kind, min, max, avg, p95, count: sorted.length };
  });
};

export const rankByCoverage = (runs: readonly AdaptiveRun[]): readonly RunHealthMetric[] => {
  return runs
    .map((run): RunHealthMetric => {
      const decisions = run.decisions;
      const topRisk = decisions.reduce<AdaptiveDecision['risk']>((best, decision) => {
        const riskLevel = riskRank(decision.risk);
        return riskRank(best) >= riskLevel ? best : decision.risk;
      }, 'low');

      const uniqueServiceCount = new Set(run.decisions.flatMap((decision) => decision.selectedActions.flatMap((action) => action.targets))).size;
      const conflicts = toConflicts(decisions).length;
      const coverage = run.decisions.length === 0 ? 0 : Math.min(1, uniqueServiceCount / Math.max(1, run.decisions.length));
      const score = Math.max(0, coverage * 100 - conflicts * 10 - run.decisions.length);
      return {
        runId: run.incidentId,
        tenantId: `${run.policyId}`,
        signalCoverage: coverage,
        topRisk,
        decisionDensity: run.decisions.length,
        conflictCount: conflicts,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);
};

const riskRank = (risk: AdaptiveDecision['risk']): number => {
  switch (risk) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
};

const toConflicts = (decisions: readonly AdaptiveDecision[]): readonly AdaptiveDecision[][] => {
  const grouped = new Map<string, AdaptiveDecision[]>();
  for (const decision of decisions) {
    for (const action of decision.selectedActions) {
      const service = action.targets[0] ?? 'global';
      const entries = grouped.get(service) ?? [];
      entries.push(decision);
      grouped.set(service, entries);
    }
  }

  return Array.from(grouped.values()).filter((entries) => entries.length > 1);
};

export const scorePolicyCoverage = (policies: readonly AdaptivePolicy[], decisions: readonly AdaptiveDecision[]): number => {
  if (policies.length === 0) return 0;
  const matched = new Set<string>();
  for (const decision of decisions) {
    matched.add(decision.policyId);
  }
  return matched.size / policies.length;
};

export const aggregateActionsByType = (decisions: readonly AdaptiveDecision[]): Record<AdaptiveAction['type'], number> => {
  const aggregate: Record<AdaptiveAction['type'], number> = {
    'scale-up': 0,
    reroute: 0,
    throttle: 0,
    failover: 0,
    notify: 0,
  };

  for (const decision of decisions) {
    for (const action of decision.selectedActions) {
      aggregate[action.type] += 1;
    }
  }
  return aggregate;
};

export const buildRunDigest = (run: AdaptiveRun): RunSignalDigest => {
  const actionCounts = aggregateActionsByType(run.decisions);
  const hotspotTypes = Object.entries(actionCounts)
    .sort((left, right) => right[1] - left[1])
    .filter(([, count]) => count > 0)
    .map(([type]) => type);
  return {
    runId: run.incidentId,
    policyCount: new Set(run.decisions.map((decision) => decision.policyId)).size,
    decisionCount: run.decisions.length,
    actionCount: Object.values(actionCounts).reduce((acc, value) => acc + value, 0),
    hotspots: hotspotTypes,
  };
};

export const createWindowDigest = (runRows: readonly AdaptiveRun[]): { tenantId: string; totalScore: number; top: readonly AdaptiveRun[] } => {
  const metrics = rankByCoverage(runRows);
  const topRows = metrics.slice(0, 10).map((metric) => runRows.find((run) => run.incidentId === metric.runId)).filter((run): run is AdaptiveRun => run !== undefined);
  const totalScore = metrics.reduce((acc, metric) => acc + metric.score, 0);
  return {
    tenantId: runRows.length > 0 ? `${runRows[0].policyId}` : 'unknown',
    totalScore,
    top: topRows,
  };
};

export const scoreSignalHealth = (stats: readonly SignalStats[]): number => {
  if (stats.length === 0) return 0;
  const avgDeviation = stats.reduce((acc, stat) => {
    const baseline = stat.avg === 0 ? 1 : Math.abs(stat.avg);
    return acc + Math.abs(stat.p95 - baseline) / baseline;
  }, 0);
  return Math.max(0, 100 - avgDeviation * 10);
};
