import { withBrand } from '@shared/core';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RunSession, RecoverySignal, SessionDecision } from '@domain/recovery-operations-models';
import type { RunAssessment } from '@domain/recovery-operations-intelligence';
import { toDotGraph } from '@domain/recovery-operations-models/command-graph';
import type { OperationsAnalyticsReport } from '@data/recovery-operations-analytics';
import { summarizeAggregateSignals, routeSummaryReport, emitSummary, HumanReadableSummaryFormatter } from '@data/recovery-operations-analytics/summaries';
import { buildOperationsReport } from '@data/recovery-operations-analytics/aggregation';

export interface AnalyticsWindow {
  readonly tenant: string;
  readonly from: string;
  readonly to: string;
  readonly signals: readonly RecoverySignal[];
  readonly sessions: readonly RunSession[];
  readonly decisions: readonly SessionDecision[];
}

export interface AnalyticsResult {
  readonly report: OperationsAnalyticsReport;
  readonly summary: string;
  readonly graphDot: string;
}

const parseWindows = (input: AnalyticsWindow): { from: string; to: string } => ({
  from: input.from,
  to: input.to,
});

const normalizeAssessments = (sessions: readonly RunSession[]): readonly RunAssessment[] =>
  sessions.map((session) => ({
    runId: withBrand(String(session.runId), 'IntelligenceRunId'),
    tenant: String(session.id),
    riskScore: session.signals.reduce((sum, signal) => sum + signal.severity, 0),
    confidence: session.signals.length ? session.signals.reduce((sum, signal) => sum + signal.confidence, 0) / session.signals.length : 0,
    bucket: session.signals.length > 10 ? 'critical' : session.signals.length > 5 ? 'high' : 'low',
    intensity: {
      bucket: session.signals.length > 10 ? 'critical' : session.signals.length > 5 ? 'high' : 'low',
      averageSeverity: session.signals.length
        ? Number((session.signals.reduce((sum, signal) => sum + signal.severity, 0) / session.signals.length).toFixed(2))
        : 0,
      signalCount: session.signals.length,
    },
    constraints: {
      maxParallelism: session.constraints.maxParallelism,
      maxRetries: session.constraints.maxRetries,
      timeoutMinutes: session.constraints.timeoutMinutes,
      operatorApprovalRequired: session.constraints.operatorApprovalRequired,
    },
    recommendedActions: [
      `session:${session.id}`,
      `status:${session.status}`,
      `timeout:${session.constraints.timeoutMinutes}`,
    ],
    plan: {
      id: withBrand(`${session.runId}-analysis`, 'RunPlanId'),
      name: `analysis-${session.runId}`,
      constraints: {
        maxParallelism: Math.max(1, session.constraints.maxParallelism),
        maxRetries: Math.max(0, session.constraints.maxRetries),
        timeoutMinutes: Math.max(1, session.constraints.timeoutMinutes),
        operatorApprovalRequired: session.constraints.operatorApprovalRequired,
      },
      fingerprint: {
        tenant: withBrand(String(session.id), 'TenantId'),
        region: 'global',
        serviceFamily: 'recovery-operations',
        impactClass: 'application',
        estimatedRecoveryMinutes: session.constraints.timeoutMinutes,
      },
      sourceSessionId: session.id,
      effectiveAt: new Date().toISOString(),
      program: {
        id: withBrand(`${session.runId}-program`, 'RecoveryProgramId'),
        tenant: withBrand(String(session.id), 'TenantId'),
        service: withBrand('recovery-operations', 'ServiceId'),
        name: `analysis-program-${session.runId}`,
        description: 'Operations analytics derived plan snapshot',
        priority: 'gold',
        mode: 'restorative',
        window: {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          timezone: 'UTC',
        },
        topology: {
          rootServices: ['recovery-operations'],
          fallbackServices: ['recovery-operations-fallback'],
          immutableDependencies: [['recovery-operations', 'state-store']],
        },
        constraints: [],
        steps: [],
        owner: 'recovery-operations-analytics',
        tags: ['generated', 'analytics'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
    } as never,
    source: String(session.id),
    createdAt: new Date().toISOString(),
  }));

export const buildCommandAnalyticsReport = async (
  repository: RecoveryOperationsRepository,
  input: AnalyticsWindow,
): Promise<AnalyticsResult> => {
  parseWindows(input);
  const report = buildOperationsReport({
    tenant: input.tenant,
    signals: [...input.signals],
    sessions: [...input.sessions],
    decisions: [...input.decisions],
    assessments: normalizeAssessments(input.sessions),
  } as any);

  const summary = summarizeAggregateSignals({
    tenant: input.tenant,
    sessions: [...input.sessions],
    signals: [...input.signals],
    assessments: normalizeAssessments(input.sessions),
  });

  const formatter = new HumanReadableSummaryFormatter();
  const summaryText = formatter.formatOverview(summary);
  await emitSummary(summary, formatter, { emit: (_summary) => { void _summary; } });
  await routeSummaryReport(summary, [
    {
      publishReport: async () => Promise.resolve(),
      publishSnapshot: async () => Promise.resolve(),
    },
  ]);

  void repository;
  return {
    report,
    summary: summaryText,
    graphDot: toDotGraph({ tenant: input.tenant, planId: String(input.tenant), nodes: [], edges: [], criticalPathWeight: 0, generatedAt: new Date().toISOString() }),
  };
};

export const runAnalyticsForRun = async (
  repository: RecoveryOperationsRepository,
  tenant: string,
  runId: string,
  signals: readonly RecoverySignal[],
): Promise<AnalyticsResult> => {
  const now = new Date().toISOString();
  const session = await repository.loadSessionByRunId(runId);
  const sessions: RunSession[] = session ? [session] : [];

  const decisions: SessionDecision[] = sessions.map((entry) => ({
    runId: entry.runId,
    ticketId: String(entry.ticketId),
    accepted: entry.status !== 'failed',
    reasonCodes: [`status:${entry.status}`],
    score: entry.constraints.timeoutMinutes / 60,
    createdAt: now,
  }));

  return buildCommandAnalyticsReport(repository, {
    tenant,
    from: new Date(Date.now() - 60_000).toISOString(),
    to: now,
    signals,
    sessions,
    decisions,
  });
};
