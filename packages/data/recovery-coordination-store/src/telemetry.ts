import { PathValue } from '@shared/type-level';
import type { CoordinationPlanCandidate, CoordinationRunId, CoordinationTenant } from '@domain/recovery-coordination';
import type { CoordinationRecord, RecoveryCoordinationQuery } from './models';

export interface CoordinationSignal {
  readonly kind: 'risk' | 'policy' | 'operator';
  readonly value: number;
  readonly note: string;
}

export interface CoordinationTrend {
  readonly runId: CoordinationRunId;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly metrics: {
    readonly avgRisk: number;
    readonly avgResilience: number;
    readonly topCandidate: string;
    readonly selectionOutcome: RecoverySelectionOutcome;
  };
}

export interface CoordinationHealth {
  readonly tenant: CoordinationTenant;
  readonly healthyRate: number;
  readonly blockedRate: number;
  readonly throughput: number;
}

export type RecoverySelectionOutcome = 'approved' | 'deferred' | 'blocked';

export interface CandidateTimelinePoint {
  readonly stepIndex: number;
  readonly candidateId: string;
  readonly score: number;
  readonly resilience: number;
}

export const deriveSignals = (record: CoordinationRecord): readonly CoordinationSignal[] => {
  const candidate = record.selection.selectedCandidate;
  const candidateRisk = candidate.metadata.riskIndex;
  const baseline = candidate.metadata.resilienceScore;
  const policyPenalty = candidate.metadata.expectedCompletionMinutes / 100;

  return [
    {
      kind: 'risk',
      value: candidateRisk,
      note: `candidate=${candidate.id}`,
    },
    {
      kind: 'policy',
      value: 1 - baseline,
      note: `required-approvals=${record.selection.alternatives.length}`,
    },
    {
      kind: 'operator',
      value: policyPenalty,
      note: `tags=${record.tags.join(',')}`,
    },
  ];
};

export const scoreFromCandidate = (candidate: CoordinationPlanCandidate): number => {
  const risk = 1 - candidate.metadata.riskIndex;
  const resilience = candidate.metadata.resilienceScore;
  const speed = candidate.metadata.expectedCompletionMinutes === 0
    ? 1
    : Math.min(1, 20 / Math.max(1, candidate.metadata.expectedCompletionMinutes));
  return Number(((risk + resilience + speed) / 3).toFixed(4));
};

export const buildTimeline = (candidates: readonly CoordinationPlanCandidate[]): readonly CandidateTimelinePoint[] =>
  candidates.map((candidate, index) => ({
    stepIndex: index,
    candidateId: candidate.id,
    score: scoreFromCandidate(candidate),
    resilience: candidate.metadata.resilienceScore,
  }));

export const healthFromRecords = (
  records: readonly CoordinationRecord[],
  tenant: CoordinationTenant,
): CoordinationHealth => {
  const tenantRecords = records.filter((record) => record.tenant === tenant);
  if (!tenantRecords.length) {
    return {
      tenant,
      healthyRate: 0,
      blockedRate: 0,
      throughput: 0,
    };
  }

  const approved = tenantRecords.filter((record) => record.selection.decision === 'approved').length;
  const blocked = tenantRecords.filter((record) => record.selection.decision === 'blocked').length;
  const blockedRate = blocked / tenantRecords.length;

  return {
    tenant,
    healthyRate: approved / tenantRecords.length,
    blockedRate,
    throughput: tenantRecords.length / Math.max(1, tenantRecords.length / 2),
  };
};

export const trendFromQuery = (
  query: RecoveryCoordinationQuery,
  records: readonly CoordinationRecord[],
): CoordinationTrend => {
  const runIds = records
    .filter((record) => (query.tenant ? record.tenant === query.tenant : true))
    .map((record) => `${record.runId}` as CoordinationRunId);

  const [runId = 'unknown' as CoordinationRunId] = runIds;

  const recordsByRun = records.filter((record) => `${record.runId}` === `${runId}`);
  const sorted = recordsByRun.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latest = sorted.at(-1);

  const topCandidate = latest?.selection.selectedCandidate.id ?? 'none';
  const avgRisk = latest
    ? latest.selection.selectedCandidate.metadata.riskIndex
    : 0;
  const avgResilience = latest
    ? latest.selection.selectedCandidate.metadata.resilienceScore
    : 0;

  const start = recordsByRun.at(0)?.createdAt ?? new Date(0).toISOString();
  const end = latest?.createdAt ?? new Date().toISOString();

  return {
    runId,
    windowStart: start,
    windowEnd: end,
    metrics: {
      avgRisk,
      avgResilience,
      topCandidate,
      selectionOutcome: latest?.selection.decision ?? 'deferred',
    },
  };
};

export const pathValue = <T extends object, P extends string>(value: T, path: P): PathValue<T, P> => {
  const segments = path.split('.');
  let current: unknown = value as unknown;
  for (const segment of segments) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined as PathValue<T, P>;
  }
  return current as PathValue<T, P>;
};
