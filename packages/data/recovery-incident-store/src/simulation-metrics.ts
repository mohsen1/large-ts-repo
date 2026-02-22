import type { IncidentId, IncidentRecord, IncidentPlan, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import { buildIncidentRollups } from './queries';
import type { IncidentPlanRecord } from './types';

export interface SimulationEnvelope {
  readonly seed: string;
  readonly total: number;
  readonly successRate: number;
  readonly runTime: number;
}

export interface SimulationForecast {
  readonly incidentId: IncidentId;
  readonly expectedRuns: number;
  readonly confidence: number;
  readonly reason: string;
}

export interface ResolutionProjection {
  readonly incidentId: IncidentId;
  readonly projectedResolutionMinutes: number;
  readonly projectedRiskScore: number;
  readonly recommendedPriority: 'low' | 'medium' | 'high' | 'urgent';
}

const MAX_HORIZON_MINUTES = 240;

interface SimulationQuery {
  readonly data: readonly IncidentRecord[];
  readonly total: number;
}

export const buildSimulationEnvelope = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlan[],
  runs: readonly OrchestrationRun[],
): SimulationEnvelope => {
  const total = incidents.length + plans.length;
  const normalizedSignalDensity = incidents.reduce((sum, incident) => sum + incident.signals.length, 0) / Math.max(1, incidents.length);
  const doneRuns = runs.filter((run) => run.state === 'done').length;
  const successRate = total === 0 ? 0 : doneRuns / Math.max(1, runs.length);
  const runTime = Math.max(
    0,
    Math.floor((normalizedSignalDensity * plans.length * 5) + (incidents.length * 3)),
  );

  return {
    seed: `${incidents.length}-${plans.length}-${runs.length}`,
    total,
    successRate: Number(successRate.toFixed(4)),
    runTime: Math.min(MAX_HORIZON_MINUTES, runTime),
  };
};

export const forecastFromRuns = (runs: readonly OrchestrationRun[]): readonly SimulationForecast[] => {
  const grouped = new Map<string, OrchestrationRun[]>();
  for (const run of runs) {
    const key = String(run.nodeId);
    grouped.set(key, [...(grouped.get(key) ?? []), run]);
  }

  const forecasts = Array.from(grouped.entries()).map(([incidentId, nodeRuns]) => {
    const failed = nodeRuns.filter((run) => run.state === 'failed').length;
    const done = nodeRuns.filter((run) => run.state === 'done').length;
    const expectedRuns = nodeRuns.length + failed;
    const successRate = done / Math.max(1, nodeRuns.length);
    const reason = expectedRuns > 4 ? 'high-traffic' : successRate > 0.7 ? 'stable' : 'elevated-risk';
    return {
      incidentId: incidentId as IncidentId,
      expectedRuns,
      confidence: Number(successRate.toFixed(4)),
      reason,
    };
  });

  return forecasts.sort((a, b) => b.expectedRuns - a.expectedRuns);
};

export const buildResolutionProjections = (
  incidents: readonly IncidentRecord[],
  incidentPlans: readonly IncidentPlanRecord[],
): readonly ResolutionProjection[] => {
  return incidentPlans.map((plan) => {
    const incident = incidents.find((record) => record.id === plan.incidentId);
    if (!incident) {
      return {
        incidentId: plan.incidentId,
        projectedResolutionMinutes: 120,
        projectedRiskScore: plan.plan.riskScore,
        recommendedPriority: 'medium',
      };
    }
    const unresolvedHours = incident.resolvedAt ? 0 : 8;
    const planRisk = plan.plan.riskScore;
    const projectedResolutionMinutes = Math.min(
      MAX_HORIZON_MINUTES,
      30 + unresolvedHours * 15 + plan.plan.riskScore * 200,
    );
    const recommendedPriority = choosePriority(incident.severity, planRisk, unresolvedHours);
    const projectedRiskScore = normalize(planRisk, unresolvedHours);
    return {
      incidentId: plan.incidentId,
      projectedResolutionMinutes,
      projectedRiskScore,
      recommendedPriority,
    };
  });
};

export const summarizeSimulationQuery = (
  query: SimulationQuery,
): string => {
  const aggregate = buildIncidentRollups(
    query.data,
    [],
    [],
    [],
  ).reduce((sum, item) => sum + item.runCount, 0);
  const incidents = query.total;
  return `Simulating ${incidents} incidents with ${aggregate} run touchpoints`;
};

const choosePriority = (
  severity: IncidentRecord['severity'],
  riskScore: number,
  unresolvedHours: number,
): ResolutionProjection['recommendedPriority'] => {
  const score = severityWeight(severity) + riskScore + unresolvedHours;
  if (score >= 7.5) return 'urgent';
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
};

const normalize = (risk: number, unresolvedHours: number): number => {
  const score = Math.max(0, Math.min(1, risk + unresolvedHours / 100));
  return Number(score.toFixed(4));
};

const severityWeight = (severity: IncidentRecord['severity']): number => {
  if (severity === 'low') return 1;
  if (severity === 'medium') return 2;
  if (severity === 'high') return 3;
  if (severity === 'critical') return 4;
  return 5;
};
