import { withBrand } from '@shared/core';
import { z } from 'zod';
import type {
  RunSession,
  RecoverySignal,
  SessionDecision,
} from '@domain/recovery-operations-models';
import type { RunAssessment } from '@domain/recovery-operations-intelligence';
import type { BatchAnalyticsInput, SessionSignalDensity, OperationsAnalyticsReport, RecoveryScoreTrend, MetricWindowContext } from './types';

const windowSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  zone: z.string().min(1),
  kind: z.union([z.literal('minute'), z.literal('hour'), z.literal('day')]),
});

const safeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

export const parseMetricWindow = (input: unknown): MetricWindowContext => windowSchema.parse(input);

export interface SignalDensityAccumulator {
  readonly runId: string;
  totalSeverity: number;
  totalConfidence: number;
  count: number;
}

const emptySignalAccumulator = (): SignalDensityAccumulator => ({
  runId: '',
  totalSeverity: 0,
  totalConfidence: 0,
  count: 0,
});

export const calculateSignalDensity = (
  runId: string,
  tenant: string,
  signals: readonly RecoverySignal[],
): SessionSignalDensity => {
  const totalSeverity = signals.reduce((sum, signal) => sum + safeNumber(signal.severity, 0), 0);
  const totalConfidence = signals.reduce((sum, signal) => sum + safeNumber(signal.confidence, 0), 0);
  const count = signals.length;

  return {
    runId: runId as SessionSignalDensity['runId'],
    tenant,
    signalCount: count,
    averageSeverity: count ? Number((totalSeverity / count).toFixed(2)) : 0,
    confidence: count ? Number((totalConfidence / count).toFixed(4)) : 0,
  };
};

const groupSignalDensityByRun = (sessions: readonly RunSession[]): Map<string, SessionSignalDensity> => {
  const byRun = new Map<string, SignalDensityAccumulator>();

  for (const session of sessions) {
    const existing = byRun.get(String(session.runId)) ?? { ...emptySignalAccumulator() };
    const next = {
      runId: String(session.runId),
      totalSeverity: existing.totalSeverity + session.signals.reduce((acc, signal) => acc + safeNumber(signal.severity, 0), 0),
      totalConfidence: existing.totalConfidence + session.signals.reduce((acc, signal) => acc + safeNumber(signal.confidence, 0), 0),
      count: existing.count + session.signals.length,
    };
    byRun.set(String(session.runId), next);
  }

  return new Map(Array.from(byRun.entries()).map(([runId, value]) => [
    runId,
    {
      runId,
      tenant: 'recovery-tenant',
      signalCount: value.count,
      averageSeverity: value.count ? value.totalSeverity / value.count : 0,
      confidence: value.count ? value.totalConfidence / value.count : 0,
    },
  ]));
};

const normalizeStatusBuckets = (sessions: readonly RunSession[]): Record<RunSession['status'], number> => {
  const counts = {
    queued: 0,
    warming: 0,
    running: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
    aborted: 0,
  } satisfies Record<RunSession['status'], number>;

  for (const session of sessions) {
    counts[session.status] += 1;
  }

  return counts;
};

const buildTrend = (values: readonly number[]): RecoveryScoreTrend => {
  if (values.length < 2) {
    return {
      points: values.map((value, index) => ({ timestamp: new Date(Date.now() + index * 60_000).toISOString(), value })),
      direction: 'flat',
    };
  }

  const head = values[0] ?? 0;
  const tail = values[values.length - 1] ?? 0;
  const delta = tail - head;
  const direction = delta > 0.5 ? 'rising' : delta < -0.5 ? 'falling' : 'flat';

  return {
    points: values.map((value, index) => ({ timestamp: new Date(Date.now() + index * 60_000).toISOString(), value })),
    direction,
  };
};

const assessRiskBands = (assessments: readonly RunAssessment[]): { green: number; amber: number; red: number } => {
  const counts = { green: 0, amber: 0, red: 0 };

  for (const assessment of assessments) {
    const bucket = assessment.bucket;
    if (bucket === 'low' || bucket === 'medium') {
      counts.green += 1;
    } else if (bucket === 'high') {
      counts.amber += 1;
    } else {
      counts.red += 1;
    }
  }

  return counts;
};

const acceptanceRate = (decisions: readonly SessionDecision[]): { total: number; accepted: number; rejectionRate: number } => {
  const total = decisions.length;
  const accepted = decisions.reduce((acc, decision) => (decision.accepted ? acc + 1 : acc), 0);
  const rejectionRate = total > 0 ? Number((1 - accepted / total).toFixed(4)) : 0;
  return { total, accepted, rejectionRate };
};

export const buildOperationsReport = (input: BatchAnalyticsInput): OperationsAnalyticsReport => {
  const context: MetricWindowContext = parseMetricWindow({
    from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
    zone: 'UTC',
    kind: 'hour',
  });

  const density = calculateSignalDensity(
    `${input.tenant}-aggregate`,
    input.tenant,
    input.signals,
  );

  const grouped = groupSignalDensityByRun(input.sessions);
  const scoreTrend = buildTrend(input.sessions.map((session) => session.signals.length + session.constraints.maxRetries));

  const bands = assessRiskBands(input.assessments);
  const decisions = acceptanceRate(input.decisions);

  return {
    tenant: input.tenant,
    window: context,
    signalDensity: [density, ...grouped.values()],
    scoreTrend,
    runCoverage: input.sessions.length > 0 ? Number((input.decisions.length / input.sessions.length).toFixed(4)) : 0,
    approvals: {
      total: decisions.total,
      accepted: decisions.accepted,
      rejectionRate: decisions.rejectionRate,
    },
    riskBands: {
      green: bands.green,
      amber: bands.amber,
      red: bands.red,
    },
    createdAt: new Date().toISOString(),
  };
};

export const enrichScoredSessions = (
  sessions: readonly RunSession[],
): readonly (RunSession & { riskDensity: number; acceptanceRate: number; signalDensity: SessionSignalDensity })[] => {
  const grouped = groupSignalDensityByRun(sessions);

  return sessions.map((session) => {
    const density = grouped.get(String(session.runId));
    const score = session.signals.reduce((acc, signal) => acc + safeNumber(signal.severity, 0) + safeNumber(signal.confidence, 0), 0);
    const weighted = density ? density.confidence * 100 : 0;
    const acceptanceRate = Math.max(0, Math.min(1, 1 - score / 200));

    return {
      ...session,
      riskDensity: Number((weighted + score).toFixed(4)),
      acceptanceRate,
      signalDensity: density ?? {
        runId: session.runId,
        tenant: String(session.id),
        signalCount: session.signals.length,
        averageSeverity: 0,
        confidence: 0,
      },
      constraints: {
        ...session.constraints,
      },
      status: (session.status === 'queued' && weighted > 50) ? 'running' : session.status,
    } as RunSession & { riskDensity: number; acceptanceRate: number; signalDensity: SessionSignalDensity };
  });
};

export const buildWindowKey = (tenant: string, window: MetricWindowContext): string => {
  const { kind, from, to } = window;
  return withBrand(`${tenant}:${kind}:${from}:${to}`, 'MetricEnvelopeKey');
};
