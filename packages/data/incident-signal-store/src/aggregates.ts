import type {
  SignalEnvelope,
  SignalRiskProfile,
  SignalPlanCandidate,
  SignalId,
  RiskBand,
} from '@domain/incident-signal-intelligence';

export interface SignalAggregate {
  readonly tenantId: string;
  readonly totalSignals: number;
  readonly averageImpact: number;
  readonly topCritical: number;
  readonly unresolvedSignals: number;
  readonly openActions: number;
}

export interface SignalCatalog {
  readonly aggregate: SignalAggregate;
  readonly criticalSignals: readonly SignalEnvelope[];
  readonly topPlans: readonly SignalPlanCandidate[];
}

export const buildSignalAggregate = (
  signals: readonly SignalEnvelope[],
  plans: readonly SignalPlanCandidate[],
): SignalAggregate => {
  const tenantId = signals.length ? signals[0].tenantId : 'unknown';
  const critical = signals.filter((signal) => signal.risk === 'critical').length;
  const unresolved = signals.filter((signal) => signal.state !== 'resolved').length;
  const avgImpact = signals.length === 0
    ? 0
    : signals.reduce((acc, signal) => acc + signal.vector.magnitude, 0) / signals.length;

  return {
    tenantId,
    totalSignals: signals.length,
    averageImpact: Number(avgImpact.toFixed(4)),
    topCritical: critical,
    unresolvedSignals: unresolved,
    openActions: plans.filter((plan) => !plan.approved).length,
  };
};

export const buildSignalCatalog = (
  signals: readonly SignalEnvelope[],
  plans: readonly SignalPlanCandidate[],
  tenantId: string,
): SignalCatalog => ({
  aggregate: {
    tenantId,
    totalSignals: signals.length,
    averageImpact: signals.length === 0
      ? 0
      : Number((signals.reduce((acc, signal) => acc + signal.vector.magnitude, 0) / signals.length).toFixed(4)),
    topCritical: signals.filter((signal) => signal.risk === 'critical').length,
    unresolvedSignals: signals.filter((signal) => signal.state !== 'resolved').length,
    openActions: plans.filter((plan) => !plan.approved).length,
  },
  criticalSignals: signals.filter((signal) => signal.risk === 'critical').slice(0, 5),
  topPlans: [...plans]
    .sort((left, right) => left.expectedDowntimeMinutes - right.expectedDowntimeMinutes)
    .slice(0, 10),
});

export const findSignalsInZone = (
  signals: readonly SignalEnvelope[],
  zone: SignalEnvelope['zone'],
): readonly SignalEnvelope[] => signals.filter((signal) => signal.zone === zone);

export const scoreDistribution = (
  signals: readonly SignalEnvelope[],
): Record<RiskBand, number> => {
  const empty: Record<RiskBand, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
  return signals.reduce((acc, signal) => {
    acc[signal.risk] += 1;
    return acc;
  }, empty);
};

export const latestPlansBySignal = (
  plans: readonly SignalPlanCandidate[],
): Record<SignalId, SignalPlanCandidate | undefined> => {
  const latest = new Map<SignalId, SignalPlanCandidate>();
  for (const plan of plans) {
    const current = latest.get(plan.signalId);
    if (!current || plan.expectedDowntimeMinutes < current.expectedDowntimeMinutes) {
      latest.set(plan.signalId, plan);
    }
  }
  return Object.fromEntries(latest) as Record<SignalId, SignalPlanCandidate | undefined>;
};

export const buildEdgesFromSignals = (
  signals: readonly SignalEnvelope[],
): readonly import('@domain/incident-signal-intelligence').SignalEdge[] => {
  return signals.flatMap((signal, index) => {
    return signals
      .filter((neighbor) => neighbor.id !== signal.id)
      .slice(0, 2)
      .map((neighbor, offset) => ({
        from: signal.id,
        to: neighbor.id,
        weight: Math.max(0.01, signal.vector.entropy + offset + index * 0.01),
      }));
  });
};
