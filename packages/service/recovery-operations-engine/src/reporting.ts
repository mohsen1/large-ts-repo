import { calculateSessionQuality, type SessionSnapshot, type QualityEnvelope, buildSessionSnapshot, assembleQualityEnvelope } from './quality';
import { buildRunSchedule } from './schedule';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import type { RunSession } from '@domain/recovery-operations-models';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { DecisionSummary } from './quality';

export interface RunReport {
  readonly runId: RecoveryRunState['runId'];
  readonly planId: RunPlanSnapshot['id'];
  readonly tenant: string;
  readonly scheduleSlotCount: number;
  readonly parallelism: number;
  readonly totalTimeoutMs: number;
  readonly quality: QualityEnvelope;
}

export interface ReportRow {
  readonly key: string;
  readonly value: string;
}

export interface ReportInputs {
  readonly runId: RecoveryRunState['runId'];
  readonly plan: RunPlanSnapshot;
  readonly sessions: readonly RunSession[];
  readonly decisions: readonly DecisionSummary[];
}

type RunPlanStatus = RunPlanSnapshot['id'];

const formatRisk = (score: number): 'low' | 'medium' | 'high' => {
  if (score >= 0.75) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
};

const dedupeRows = (rows: readonly ReportRow[]): readonly ReportRow[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
};

const flattenPlanStatus = (status: RunPlanStatus): string => String(status).slice(0, 24);

export const buildReportRows = (input: ReportInputs, tenant: string): readonly ReportRow[] => {
  const schedule = buildRunSchedule(input.plan, input.sessions[0]!, {
    approvals: input.decisions.length,
    signalPressure: input.sessions.flatMap((session) => session.signals).reduce((acc, signal) => acc + signal.severity, 0) / 10,
  });

  const snapshot: SessionSnapshot = buildSessionSnapshot(input.sessions, input.decisions);
  const quality = assembleQualityEnvelope(tenant, input.plan, snapshot);
  const sessionQuality = calculateSessionQuality(input.plan, input.sessions);
  const status = formatRisk(sessionQuality.quality);

  const rows: ReportRow[] = [
    {
      key: 'runId',
      value: String(input.runId),
    },
    {
      key: 'planId',
      value: String(input.plan.id),
    },
    {
      key: 'tenant',
      value: tenant,
    },
    {
      key: 'status',
      value: status,
    },
    {
      key: 'slots',
      value: `${schedule.segments.length}`,
    },
    {
      key: 'parallelism',
      value: `${schedule.batchSize}`,
    },
    {
      key: 'timeoutMs',
      value: `${schedule.totalTimeoutMs}`,
    },
    {
      key: 'qualityScore',
      value: `${quality.score.toFixed(4)}`,
    },
    {
      key: 'riskScore',
      value: `${quality.riskScore.toFixed(4)}`,
    },
    {
      key: 'throughput',
      value: quality.throughputHint,
    },
    {
      key: 'flattenedPlan',
      value: flattenPlanStatus(input.plan.id),
    },
    {
      key: 'tenantStamped',
      value: withBrand(tenant, 'TenantId'),
    },
  ];

  return dedupeRows(rows);
};

export const summarizeReport = (input: ReportInputs, tenant: string): RunReport => {
  const schedule = buildRunSchedule(input.plan, input.sessions[0]!, {
    approvals: input.decisions.length,
  });
  const snapshot: SessionSnapshot = buildSessionSnapshot(input.sessions, input.decisions);
  const quality = assembleQualityEnvelope(tenant, input.plan, snapshot);

  return {
    runId: input.runId,
    planId: input.plan.id,
    tenant,
    scheduleSlotCount: schedule.segments.length,
    parallelism: schedule.batchSize,
    totalTimeoutMs: schedule.totalTimeoutMs,
    quality,
  };
};
