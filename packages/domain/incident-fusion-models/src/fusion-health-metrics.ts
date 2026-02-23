import type { RecoveryScenario, RecoverySignal, RecoveryAction, ActionId } from './incident-fusion-core';
import { scoreSignalEnvelope, type SignalEnvelope, type SignalId, type PriorityBand, type RecoverySignal as ScoredRecoverySignal } from './incident-fusion-core';

export interface ReadinessGauge {
  readonly scenarioId: RecoveryScenario['id'];
  readonly tenant: string;
  readonly value: number;
  readonly status: 'degraded' | 'healthy' | 'unsafe';
  readonly trend: 'up' | 'flat' | 'down';
}

export interface ThroughputMetric {
  readonly tenant: string;
  readonly scenarioId: RecoveryScenario['id'];
  readonly measuredAt: string;
  readonly resolvedCount: number;
  readonly pendingCount: number;
  readonly inFlightCount: number;
  readonly averageActionTimeMinutes: number;
}

export interface IncidentHealthReport {
  readonly tenant: string;
  readonly scenarios: readonly RecoveryScenario[];
  readonly signals: readonly RecoverySignal[];
  readonly readiness: readonly ReadinessGauge[];
  readonly throughput: readonly ThroughputMetric[];
  readonly riskSignal: number;
}

export interface ActionBacklogItem {
  readonly actionId: ActionId;
  readonly scenarioId: RecoveryScenario['id'];
  readonly priority: PriorityBand;
  readonly owner: string;
  readonly estimatedMinutes: number;
  readonly dependencyCount: number;
  readonly automated: boolean;
}

export interface TimeSeriesPoint<T = number> {
  readonly at: string;
  readonly value: T;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export const computeScenarioReadiness = (scenario: RecoveryScenario, signals: readonly RecoverySignal[]): ReadinessGauge => {
  const tenantSignals = signals.filter((signal) => scenario.tenant === signal.tenant);
  const urgencyScore = tenantSignals.reduce((sum, signal) => {
    if (signal.priority === 'critical') return sum + 4;
    if (signal.priority === 'high') return sum + 3;
    if (signal.priority === 'medium') return sum + 2;
    return sum + 1;
  }, 0);

  const total = Math.max(1, tenantSignals.length);
  const severity = urgencyScore / (total * 4);
  const ageFactor = tenantSignals.reduce((sum, signal) => {
    const ageMs = Date.now() - Date.parse(signal.updatedAt);
    const penalty = Math.min(1, ageMs / (24 * 60 * 60_000));
    return sum + penalty;
  }, 0);

  const agePenalty = total === 0 ? 0 : ageFactor / total;
  const readiness = clamp(1 - severity * 0.6 - agePenalty * 0.3);
  const trend = readiness > 0.75 ? 'up' : readiness > 0.45 ? 'flat' : 'down';
  return {
    scenarioId: scenario.id,
    tenant: scenario.tenant,
    value: Math.round(readiness * 100) / 100,
    status: readiness >= 0.75 ? 'healthy' : readiness >= 0.45 ? 'degraded' : 'unsafe',
    trend,
  };
};

export const computeThroughput = (tenant: string, scenarioId: RecoveryScenario['id'], actions: readonly RecoveryAction[], now = new Date()): ThroughputMetric => {
  const byScenario = actions.filter((action) => action.scenarioId === scenarioId);
  const inFlightCount = byScenario.length;
  const resolvedCount = Math.max(0, byScenario.length - inFlightCount);
  const pendingCount = byScenario.filter((action) => !action.automated).length;
  const averageActionTimeMinutes = byScenario.length === 0 ? 0 : byScenario.reduce((sum, action) => sum + action.estimatedMinutes, 0) / byScenario.length;
  return {
    tenant,
    scenarioId,
    measuredAt: now.toISOString(),
    resolvedCount,
    pendingCount,
    inFlightCount,
    averageActionTimeMinutes: Math.round(averageActionTimeMinutes * 100) / 100,
  };
};

export const computeBacklog = (actions: readonly RecoveryAction[]): readonly ActionBacklogItem[] => {
  return actions.map((action) => ({
    actionId: action.id,
    scenarioId: action.scenarioId,
    priority: action.preconditions.length > 4 ? 'critical' : action.preconditions.length > 2 ? 'high' : 'medium',
    owner: action.owner,
    estimatedMinutes: action.estimatedMinutes,
    dependencyCount: action.dependsOn.length,
    automated: action.automated,
  }));
};

export const detectHotSignals = (
  signals: readonly SignalEnvelope<RecoverySignal>[],
  threshold = 0.7,
): readonly SignalEnvelope<RecoverySignal & { score: number; priority: PriorityBand }>[] => {
  const parsed = signals.map((envelope) => scoreSignalEnvelope(envelope) as ScoredRecoverySignal & { score: number; priority: PriorityBand });
  return parsed
    .filter((signal) => signal.score >= threshold)
    .map((signal) => ({
      tenant: signal.tenant,
      data: signal,
      recordedAt: new Date().toISOString(),
    }));
};

export const buildHealthSeries = (
  scenario: RecoveryScenario,
  signals: readonly RecoverySignal[],
  spanMinutes = 24,
): readonly TimeSeriesPoint<number>[] => {
  const values = [] as TimeSeriesPoint<number>[];
  const now = Date.now();
  for (let idx = spanMinutes; idx >= 0; idx -= 1) {
    const at = new Date(now - idx * 60_000).toISOString();
    const baseline = signals.map((signal) => {
      const age = Math.max(1, Date.now() - Date.parse(signal.updatedAt));
      return { signal, age };
    });
    const value = baseline.reduce((sum, item) => {
      const freshness = 1 / (1 + item.age / 60_000);
      return sum + item.signal.severity * freshness;
    }, 0);
    const scaled = clamp(value / Math.max(1, baseline.length || 1));
    values.push({ at, value: Math.round(scaled * 100) / 100 });
  }
  return values;
};

export const riskIndex = (scenarios: readonly RecoveryScenario[], signals: readonly RecoverySignal[]): number => {
  const riskByTenant = new Map<string, number>();
  for (const scenario of scenarios) {
    const tenantSignals = signals.filter((signal) => signal.tenant === scenario.tenant);
    const active = tenantSignals.filter((signal) => signal.state !== 'resolved');
    const base = active.reduce((sum, signal) => sum + signal.severity, 0) / Math.max(1, active.length);
    const prev = riskByTenant.get(scenario.tenant) ?? 0;
    riskByTenant.set(scenario.tenant, prev + clamp(base * scenario.riskScore));
  }

  const total = Array.from(riskByTenant.values());
  if (total.length === 0) return 0;
  return total.reduce((sum, value) => sum + value, 0) / total.length;
};

export const buildIncidentHealthReport = (
  tenant: string,
  scenarios: readonly RecoveryScenario[],
  signals: readonly RecoverySignal[],
  actions: readonly RecoveryAction[],
): IncidentHealthReport => {
  const tenantSignals = signals.filter((signal) => signal.tenant === tenant);
  const tenantScenarios = scenarios.filter((scenario) => scenario.tenant === tenant);
  const readiness = tenantScenarios.map((scenario) => computeScenarioReadiness(scenario, tenantSignals));
  const throughput = tenantScenarios.map((scenario) =>
    computeThroughput(tenant, scenario.id, actions.filter((action) => action.scenarioId === scenario.id)),
  );

  return {
    tenant,
    scenarios: tenantScenarios,
    signals: tenantSignals,
    readiness,
    throughput,
    riskSignal: riskIndex(tenantScenarios, tenantSignals),
  };
};
