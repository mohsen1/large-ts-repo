export interface PlanMetricBucket {
  metricName: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
}

export interface PlanObservation {
  commandName: string;
  startedAt: number;
  endedAt?: number;
  buckets: PlanMetricBucket[];
}

export interface PlanAudit {
  planId: string;
  operatorId: string;
  observations: PlanObservation[];
  summary: string;
}

export function buildAudit(planId: string, operatorId: string, summary: string): PlanAudit {
  return {
    planId,
    operatorId,
    observations: [],
    summary,
  };
}

export function recordMetric(audit: PlanAudit, observation: Omit<PlanObservation, 'endedAt'>): PlanAudit {
  return {
    ...audit,
    observations: [
      ...audit.observations,
      {
        ...observation,
        startedAt: observation.startedAt,
        buckets: observation.buckets,
      },
    ],
  };
}

export function finalizeObservation(observation: PlanObservation, endedAt: number): PlanObservation {
  return {
    ...observation,
    endedAt,
  };
}

export function totalDuration(observation: PlanObservation): number {
  return (observation.endedAt ?? Date.now()) - observation.startedAt;
}

export function aggregateValue(observation: PlanObservation, metricName: string): number {
  return observation.buckets
    .filter((bucket) => bucket.metricName === metricName)
    .reduce((sum, bucket) => sum + bucket.value, 0);
}
