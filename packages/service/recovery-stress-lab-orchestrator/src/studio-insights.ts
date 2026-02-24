import { NoInfer } from '@shared/type-level';
import {
  mapIterable,
  collectIterable,
  buildIteratorFingerprint,
} from '@shared/stress-lab-runtime';
import {
  OrchestrationPlan,
  RecoverySimulationResult,
  RecoverySignal,
  TenantId,
} from '@domain/recovery-stress-lab';

export interface StudioSignalTrend {
  readonly at: string;
  readonly count: number;
  readonly avgSeverity: number;
}

export interface StudioInsightPayload {
  readonly tenantId: TenantId;
  readonly riskDelta: number;
  readonly readinessRatio: number;
  readonly signature: string;
  readonly trends: readonly StudioSignalTrend[];
  readonly history: readonly string[];
}

const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 } as const;

export const normalizeSignalSeverity = <T extends RecoverySignal>(signal: T): T & { severityWeight: number } => ({
  ...signal,
  severityWeight: severityWeight[signal.severity],
});

export const buildSignalTrends = (signals: readonly RecoverySignal[]): readonly StudioSignalTrend[] => {
  const byMinute = new Map<number, RecoverySignal[]>();

  for (const signal of signals) {
    const minute = new Date(signal.createdAt).getUTCMinutes();
    const bucket = byMinute.get(minute) ?? [];
    bucket.push(signal);
    byMinute.set(minute, bucket);
  }

  const trends = [...byMinute.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([minute, bucket]) => {
      const weights = bucket.map((signal) => severityWeight[signal.severity]);
      const avgSeverity = weights.length > 0 ? weights.reduce((acc, item) => acc + item, 0) / weights.length : 0;
      return {
        at: `00:${String(minute).padStart(2, '0')}`,
        count: bucket.length,
        avgSeverity,
      };
    });

  return trends;
};

const safeNumber = (value: number, fallback: number): number => {
  return Number.isFinite(value) ? value : fallback;
};

export const makeInsights = (
  tenantId: TenantId,
  plan: OrchestrationPlan | null,
  simulation: RecoverySimulationResult | null,
  signals: readonly RecoverySignal[],
): StudioInsightPayload => {
  const riskDelta = safeNumber((simulation?.riskScore ?? 0) - (plan ? plan.estimatedCompletionMinutes / 100 : 0), 0);
  const readinessRatio = safeNumber((simulation?.slaCompliance ?? 0) / Math.max(1, signals.length), 0);

  const normalized = signals.map(normalizeSignalSeverity);
  const trends = buildSignalTrends(normalized);
  const history = collectIterable(
    mapIterable(normalized, (signal, index) => `${index}:${signal.id}:${signal.severityWeight}`),
  );

  const signature = buildIteratorFingerprint(history);

  return {
    tenantId,
    riskDelta,
    readinessRatio,
    signature,
    trends,
    history,
  };
};

export type TrendInput<TInput extends RecoverySignal[]> = NoInfer<TInput>;

export const collectTrendInput = <T extends RecoverySignal[]>(signals: TrendInput<T>): T => signals;

export const inspectSimulation = (simulation: RecoverySimulationResult | null): string => {
  if (!simulation) {
    return 'no simulation';
  }
  const finalTick = simulation.ticks.at(-1);
  const confidence = finalTick?.activeWorkloads ?? 0;
  return `simulation ${simulation.tenantId} risk=${simulation.riskScore.toFixed(3)} sla=${simulation.slaCompliance.toFixed(3)} workloads=${confidence}`;
};
