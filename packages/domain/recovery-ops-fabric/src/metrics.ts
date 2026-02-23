import { type AlertSignal, type FabricTopology, type FabricPolicyViolation, type FabricNode } from './models';

export interface WindowedLoad {
  readonly from: string;
  readonly to: string;
  readonly samples: readonly number[];
}

export interface HealthSeries {
  readonly facilityId: string;
  readonly windows: readonly WindowedLoad[];
  readonly trend: number;
}

export interface TopologyHealthSummary {
  readonly tenant: string;
  readonly windows: readonly HealthSeries[];
  readonly criticalNodes: number;
  readonly avgSignalImpact: number;
}

const safeNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
};

const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(ratio * (sorted.length - 1))));
  return safeNumber(sorted[index] ?? 0);
};

export const computeSignalImpact = (signals: readonly AlertSignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }
  const impacts = signals.map((signal) => {
    const base = signal.baseline > 0 ? signal.value / signal.baseline : 0;
    const severityBoost =
      signal.severity === 'notice'
        ? 0.15
        : signal.severity === 'warning'
          ? 0.4
          : signal.severity === 'critical'
            ? 0.8
            : 1;
    return Number(((base - 1) * severityBoost).toFixed(4));
  });

  const total = impacts.reduce((acc, value) => acc + value, 0);
  return Number((total / impacts.length).toFixed(4));
};

export const summarizeSignals = (signals: readonly AlertSignal[]): HealthSeries => {
  const buckets = Math.min(12, Math.max(1, Math.ceil(signals.length / 3)));
  const segment = Math.max(1, Math.ceil(signals.length / buckets));
  const windows: WindowedLoad[] = [];

  for (let index = 0; index < buckets; index += 1) {
    const slice = signals.slice(index * segment, (index + 1) * segment);
    const fromTs = slice[0]?.timestamp ?? new Date().toISOString();
    const toTs = slice[slice.length - 1]?.timestamp ?? fromTs;
    const samples = slice.map((signal) => Math.max(0, signal.value - signal.baseline));
    windows.push({
      from: fromTs,
      to: toTs,
      samples,
    });
  }

  const trend = percentile(signals.map((signal) => signal.value - signal.baseline), 0.75);

  return {
    facilityId: signals[0]?.facilityId ?? 'unknown',
    windows,
    trend: Number(trend.toFixed(4)),
  };
};

export const summarizeTopology = (topology: FabricTopology, signals: readonly AlertSignal[]): TopologyHealthSummary => {
  const criticalNodes = topology.nodes.filter((node) => node.health === 'critical' || node.health === 'offline');
  const grouped = new Map<string, AlertSignal[]>();

  for (const signal of signals) {
    const list = grouped.get(signal.facilityId) ?? [];
    list.push(signal);
    grouped.set(signal.facilityId, list);
  }

  const windows = Array.from(grouped.entries()).map(([facilityId, facilitySignals]) => {
    const summary = summarizeSignals(facilitySignals);
    return {
      facilityId,
      windows: summary.windows,
      trend: summary.trend,
    };
  });

  const avgSignalImpact = computeSignalImpact(signals);

  return {
    tenant: topology.tenantId,
    windows,
    criticalNodes: criticalNodes.length,
    avgSignalImpact,
  };
};

export const validateNodeHealth = (node: FabricNode): FabricPolicyViolation[] => {
  const violations: FabricPolicyViolation[] = [];
  if (node.cpu < 0 || node.mem < 0) {
    violations.push({
      field: 'steps',
      reason: `${node.id} has invalid resource usage`,
      severity: 'warning',
    });
  }
  if (node.maxCapacity <= 0) {
    violations.push({
      field: 'steps',
      reason: `${node.id} has invalid capacity`,
      severity: 'critical',
    });
  }
  return violations;
};
