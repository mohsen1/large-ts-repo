import { clampLimit, QueryRequest, QueryResult, buildCursor } from '@data/query-models';
import { OperationPlan, OperationSignal, Severity, estimatePlanMinutes } from './types';

export interface SloPolicy {
  name: string;
  tenantId: string;
  maxDurationMinutes: number;
  maxSignalWeight: number;
  prohibitedSeverities: readonly Severity[];
}

export interface SloReport {
  window: { from: string; to: string };
  capacityScore: number;
  breaches: string[];
}

export interface SloBreach {
  planId: string;
  reason: string;
  severity: Severity;
}

const compareDate = (left: string, right: string): number => Date.parse(left) - Date.parse(right);

export const buildWindow = (anchor: number, widthMinutes = 60): { from: string; to: string } => ({
  from: new Date(anchor - widthMinutes * 60_000).toISOString(),
  to: new Date(anchor).toISOString(),
});

export const estimateCapacityScore = (plan: OperationPlan): number => {
  const duration = estimatePlanMinutes(plan.steps);
  if (!duration) return 100;
  const severityPenalty = plan.severity === 'critical' ? 30 : plan.severity === 'major' ? 20 : 10;
  return Math.max(0, 100 - Math.max(0, duration - 120) - severityPenalty);
};

export const evaluateSignals = (signals: readonly OperationSignal[]): number =>
  signals.reduce((sum, signal) => sum + Math.max(0, signal.weight), 0);

export const exceedsSlo = (plan: OperationPlan, policy: SloPolicy): boolean => {
  const duration = estimatePlanMinutes(plan.steps);
  const overDuration = duration > policy.maxDurationMinutes;
  const overWeight = evaluateSignals(plan.riskSignals as OperationSignal[]) > policy.maxSignalWeight;
  const blocked = policy.prohibitedSeverities.includes(plan.severity);
  return overDuration || overWeight || blocked;
};

export const breaches = (
  plans: readonly OperationPlan[],
  policy: SloPolicy,
): SloBreach[] => {
  return plans.flatMap((plan) => {
    const reasons: string[] = [];
    if (compareDate(plan.window.endsAt, plan.requestedAt) < 0) {
      reasons.push('end before request');
    }
    const overDuration = estimateCapacityScore(plan) < 70;
    if (overDuration) reasons.push('low capacity score');
    if (exceedsSlo(plan, policy)) reasons.push('policy constraints');
    return reasons.map((reason) => ({ planId: plan.id, reason, severity: plan.severity }));
  });
};

export const summarizeForPage = (
  plans: readonly OperationPlan[],
  policy: SloPolicy,
): SloReport => {
  const now = Date.now();
  const window = buildWindow(now, 120);
  const totalScore = plans.reduce((sum, plan) => sum + estimateCapacityScore(plan), 0);
  const breachesCount = breaches(plans, policy).length;
  return {
    window,
    capacityScore: plans.length ? totalScore / plans.length : 0,
    breaches: [`window=${planWindowSummary(window)}`, `breaches=${breachesCount}`],
  };
};

const planWindowSummary = (window: { from: string; to: string }): string =>
  `${window.from}->${window.to}`;

export const paginate = <T>(items: readonly T[], limit?: number, cursor?: string): QueryResult<T> => {
  const pageSize = clampLimit(limit);
  const parsed = Number.parseInt(String(cursor ?? '0'), 10);
  const safeIndex = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const page = [...items].slice(safeIndex, safeIndex + pageSize);
  const hasMore = safeIndex + pageSize < items.length;
  return {
    cursor: hasMore ? buildCursor(safeIndex + pageSize, pageSize) : undefined,
    items: page,
    hasMore,
  };
};
