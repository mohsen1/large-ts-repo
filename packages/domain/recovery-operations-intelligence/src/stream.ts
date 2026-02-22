import type { RecoveryRiskSignal, SignalWindow, BatchReadinessAssessment } from './types';
import type { RunAssessment } from './types';
import { parseRecoveryRiskSignal, parseDecisionSet, parseCohortSignalAggregate } from './schemas';
import { aggregateByTenantAndRun, buildBatchAssessment } from './evaluator';
import { withBrand } from '@shared/core';

const isRecent = (window: SignalWindow, now: number): boolean => {
  const start = Date.parse(window.from);
  const end = Date.parse(window.to);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end;
};

export const normalizeIncomingPayload = (payload: unknown): RecoveryRiskSignal[] => {
  if (Array.isArray(payload)) {
    return payload.map((entry) => parseRecoveryRiskSignal(entry));
  }

  return [parseRecoveryRiskSignal(payload)];
};

export const bucketRecentSignals = (
  signals: readonly RecoveryRiskSignal[],
  referenceDate = new Date(),
): readonly RecoveryRiskSignal[] => {
  const now = referenceDate.getTime();
  return signals.filter((signal) => isRecent(signal.window, now));
};

export const renderDecisionSet = (tenant: string, assessments: readonly RunAssessment[]) => {
  return parseDecisionSet({
    id: withBrand(`decision-set-${tenant}-${Date.now()}`, 'DecisionSetId'),
    tenant,
    generatedAt: new Date().toISOString(),
    assessments,
    batchRisk: assessments.length >= 3 ? 'red' : assessments.length >= 1 ? 'amber' : 'green',
  } as unknown);
};

export const buildBatchFromSignals = (signals: readonly RecoveryRiskSignal[]): BatchReadinessAssessment => {
  const aggregates = aggregateByTenantAndRun(signals);
  return buildBatchAssessment(aggregates.map((cohort) => parseCohortSignalAggregate(cohort)));
};
