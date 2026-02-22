import { withBrand } from '@shared/core';
import type {
  RunPlanSnapshot,
  RecoverySignal,
  RunSession,
  SessionDecision,
} from '@domain/recovery-operations-models';
import type { RecoveryRunState } from '@domain/recovery-orchestration';

export interface SignalHealth {
  readonly runId: RecoveryRunState['runId'];
  readonly signalCount: number;
  readonly averageSeverity: number;
  readonly signalGapMs: number;
}

export interface SessionSnapshot {
  readonly sessions: readonly RunSession[];
  readonly sessionsByStatus: Readonly<Record<RunSession['status'], number>>;
  readonly signalDensityTrend: readonly number[];
  readonly decisions: readonly DecisionSummary[];
  readonly sessionsCount: number;
}

export interface DecisionSummary {
  readonly createdAt: string;
  readonly accepted: boolean;
  readonly runId: string;
  readonly score: number;
  readonly ticketId?: string;
  readonly reasonCodes?: readonly string[];
}

export interface QualityEnvelope {
  readonly runId: string;
  readonly tenant: string;
  readonly score: number;
  readonly riskScore: number;
  readonly health: SignalHealth[];
  readonly throughputHint: string;
}

export interface SignalDensityRecord {
  readonly runId: string;
  readonly count: number;
  readonly weightedSeverity: number;
  readonly normalizedConfidence: number;
}

export interface OperationsMetrics {
  readonly runId: string;
  readonly score: number;
  readonly signalCount: number;
  readonly decisionCount: number;
  readonly digest: string;
}

interface SessionQuality {
  readonly planId: RunPlanSnapshot['id'];
  readonly quality: number;
  readonly score: number;
  readonly anomalies: readonly string[];
}

type RunSessionStatus = RunSession['status'];

const statusWeight: Record<RunSessionStatus, number> = {
  queued: 0.2,
  warming: 0.4,
  running: 0.6,
  blocked: 0.3,
  completed: 1,
  failed: 0.1,
  aborted: 0.2,
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const toBrandString = (value: string): string => withBrand(value, 'TenantId');

const calculateDecisionScore = (decisions: SessionSnapshot['decisions']): number => {
  if (decisions.length === 0) return 0;
  const acceptanceRatio = decisions.reduce((acc, decision) => acc + (decision.accepted ? 1 : 0), 0) / decisions.length;
  const score = decisions.reduce((acc, decision) => acc + decision.score, 0) / decisions.length;
  return Number((acceptanceRatio * 0.5 + score / 100 * 0.5).toFixed(4));
};

export const summarizeSignals = (signals: readonly RecoverySignal[]): SignalDensityRecord[] => {
  const totals = new Map<string, SignalDensityRecord>();
  for (const signal of signals) {
    const runId = signal.id.split('-')[0];
    const existing = totals.get(runId) ?? {
      runId,
      count: 0,
      weightedSeverity: 0,
      normalizedConfidence: 0,
    };
    totals.set(runId, {
      runId,
      count: existing.count + 1,
      weightedSeverity: existing.weightedSeverity + signal.severity,
      normalizedConfidence: existing.normalizedConfidence + Math.max(0, Math.min(1, signal.confidence)),
    });
  }

  return [...totals.values()].map((entry) => ({
    ...entry,
    weightedSeverity: Number(entry.weightedSeverity.toFixed(2)),
    normalizedConfidence: Number(clamp(entry.normalizedConfidence / Math.max(1, entry.count)).toFixed(4)),
  }));
};

export const buildSignalHealth = (
  runId: RecoveryRunState['runId'],
  signals: readonly RecoverySignal[],
  windowMs: number,
): SignalHealth => {
  const count = signals.length;
  if (count === 0) {
    return {
      runId,
      signalCount: 0,
      averageSeverity: 0,
      signalGapMs: Math.max(0, windowMs),
    };
  }

  const total = signals.reduce((acc, signal) => acc + signal.severity, 0);
  const detected = signals
    .map((signal) => Date.parse(signal.detectedAt))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const averageSeverity = Number((total / count).toFixed(2));
  const oldest = detected[0];
  const latest = detected[detected.length - 1];
  const signalGapMs =
    Number.isFinite(oldest as number) && Number.isFinite(latest as number) ? latest - oldest : windowMs;

  return { runId, signalCount: count, averageSeverity, signalGapMs };
};

export const inferThroughputHint = (signalDensity: readonly SignalDensityRecord[]): string => {
  const score = signalDensity.reduce((acc, current) => acc + current.count, 0);
  if (score === 0) return 'dry';
  if (score < 5) return 'low';
  if (score < 20) return 'steady';
  return 'high';
};

export const buildSessionSnapshot = (
  sessions: readonly RunSession[],
  decisions: SessionSnapshot['decisions'],
): SessionSnapshot => {
  const sessionsByStatus = {
    queued: 0,
    warming: 0,
    running: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
    aborted: 0,
  } satisfies Record<RunSessionStatus, number>;

  const signalDensityTrend: number[] = [];
  for (const session of sessions) {
    sessionsByStatus[session.status] += 1;
    signalDensityTrend.push(session.signals.length);
  }

  return {
    sessions,
    sessionsByStatus,
    signalDensityTrend,
    decisions,
    sessionsCount: sessions.length,
  };
};

const inferTicketId = (runId: string): string => withBrand(runId, 'RunTicketId');

export const toSessionDecisions = (decisions: readonly DecisionSummary[]): readonly SessionDecision[] =>
  decisions.map((decision) => ({
    runId: decision.runId as SessionDecision['runId'],
    ticketId: decision.ticketId ?? inferTicketId(decision.runId),
    accepted: decision.accepted,
    reasonCodes: decision.reasonCodes ?? [],
    score: decision.score,
    createdAt: decision.createdAt,
  }));

export const calculateSessionQuality = (plan: RunPlanSnapshot, sessions: readonly RunSession[]): SessionQuality => {
  const health = buildSignalHealth(
    sessions[0]?.runId ?? withBrand('orphan-plan', 'RecoveryRunId'),
    sessions.flatMap((session) => session.signals),
    60 * 60 * 1000,
  );
  const score = Math.max(0, Math.min(1, 1 - health.signalGapMs / (60 * 60 * 1000)));
  const quality = Number(
    (statusWeight[(sessions.length > 0 ? sessions[0]?.status : 'queued') ?? 'queued'] * score).toFixed(4),
  );

  const anomalies = sessions
    .filter((session) => session.signals.some((signal) => signal.severity > 9))
    .map((session) => `${session.runId}:${session.status}`);

  return {
    planId: plan.id,
    quality,
    score,
    anomalies: anomalies.length ? anomalies : ['none'],
  };
};

export const createOperationsMetrics = (runId: string, score: number, signalCount: number): OperationsMetrics => {
  return {
    runId,
    score,
    signalCount,
    decisionCount: Math.max(0, Math.floor(score / 10)),
    digest: `${runId}|${score.toFixed(2)}|${signalCount}`,
  };
};

export const toDispatchSignalDigest = (metrics: OperationsMetrics): string => {
  return `${metrics.runId}:${metrics.decisionCount}:${metrics.digest}`;
};

export const assembleQualityEnvelope = (
  tenant: string,
  plan: RunPlanSnapshot,
  snapshot: SessionSnapshot,
): QualityEnvelope => {
  const signalHealth = summarizeSignals(snapshot.sessions.flatMap((session) => session.signals)).map((summary) => ({
    runId: withBrand(summary.runId, 'RecoveryRunId'),
    signalCount: summary.count,
    averageSeverity: summary.weightedSeverity / Math.max(1, summary.count),
    signalGapMs: summary.count * 60_000,
  }));

  const score = snapshot.decisions.length
    ? snapshot.decisions.reduce((acc, decision) => acc + decision.score, 0) / snapshot.decisions.length
    : 0;
  const riskScore = calculateDecisionScore(snapshot.decisions);
  const quality = calculateSessionQuality(plan, snapshot.sessions);

  const runId = withBrand(String(plan.id), 'RecoveryRunId');
  return {
    runId,
    tenant: toBrandString(tenant),
    score: quality.score * 100 + score,
    riskScore: riskScore * 100,
    health: signalHealth,
    throughputHint: inferThroughputHint(
      snapshot.sessions.flatMap((session) => session.signals).map((signal) => ({
        runId: signal.id,
        count: 1,
        weightedSeverity: signal.severity,
        normalizedConfidence: signal.confidence,
      })),
    ),
  };
};
