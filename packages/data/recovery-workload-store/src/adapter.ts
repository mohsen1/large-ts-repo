import type {
  ForecastInput,
  WorkloadDependencyGraph,
  WorkloadSnapshot,
  WorkloadUnitId,
  WorkloadNode,
  ScenarioForecast,
  PlanningPlan,
} from '@domain/recovery-workload-intelligence';

interface RawForecastInput {
  readonly node?: {
    readonly id: string;
    readonly name: string;
    readonly team: string;
    readonly criticality?: number;
    readonly region?: 'us-east-1' | 'us-west-2' | 'eu-west-1';
  };
  readonly snapshot?: WorkloadSnapshot;
  readonly riskVector?: unknown;
  readonly lookbackDays?: number;
}

const clampCriticality = (value?: number): 1 | 2 | 3 | 4 | 5 => {
  const safe = value ?? 3;
  if (safe <= 1) {
    return 1;
  }
  if (safe <= 2) {
    return 2;
  }
  if (safe <= 3) {
    return 3;
  }
  if (safe <= 4) {
    return 4;
  }
  return 5;
};

const isValidSnapshot = (value: unknown): value is WorkloadSnapshot => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'nodeId' in value &&
      'timestamp' in value &&
      'cpuUtilization' in value &&
      'iopsUtilization' in value &&
      'errorRate' in value &&
      'throughput' in value,
  );
};

export const parseForecastInputs = (rawInputs: readonly unknown[]): readonly ForecastInput[] => {
  const output: ForecastInput[] = [];
  for (const raw of rawInputs) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const candidate = raw as RawForecastInput;
    if (!candidate.node || !isValidSnapshot(candidate.snapshot)) {
      continue;
    }

    output.push({
      node: {
        id: candidate.node.id as WorkloadUnitId,
        name: candidate.node.name,
        team: candidate.node.team,
        region: candidate.node.region ?? 'us-east-1',
        primaryDependencies: [],
        criticality: clampCriticality(candidate.node.criticality),
        targetSlaMinutes: 15,
      },
      snapshot: candidate.snapshot,
      riskVector: {
        severity: 3,
        blastRadius: 'region',
        customerImpact: 30,
        recoveryToleranceSeconds: 120,
      },
      lookbackDays: typeof candidate.lookbackDays === 'number' ? candidate.lookbackDays : 7,
    });
  }

  return output;
};

export const makeTrendBuckets = (
  graph: WorkloadDependencyGraph,
  forecasts: readonly ScenarioForecast[],
): ReadonlyMap<WorkloadUnitId, number> => {
  const map = new Map<WorkloadUnitId, number>();
  for (const node of graph.nodes) {
    map.set(node.id, 0);
  }

  for (const forecast of forecasts) {
    const score = Math.max(0, 100 - forecast.projectedDowntimeMinutes);
    const current = map.get(forecast.nodeId) ?? 0;
    map.set(forecast.nodeId, current + score);
  }

  return map;
};

export const summarizePlan = (plan?: PlanningPlan): string[] => {
  if (!plan) {
    return ['no plan available'];
  }

  return [
    `window=${plan.windowKey}`,
    `forecasts=${plan.forecasts.length}`,
    `executionDepth=${plan.executionOrder.length}`,
    plan.forecasts[0] ? `primary=${plan.forecasts[0].name}` : 'primary=none',
  ];
};
