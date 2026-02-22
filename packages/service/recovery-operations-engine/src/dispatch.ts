import {
  enrichScoredSessions,
  summarizeAggregateSignals,
  routeSummaryReport,
  buildOperationsReport,
} from '@data/recovery-operations-analytics';
import type { OperationsAnalyticsReport } from '@data/recovery-operations-analytics';
import type { RecoveryOperationsRepository as DataRecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import { createOrchestrator } from './orchestrator';
import { toSessionDecisions, type SessionSnapshot } from './quality';

export interface DispatchContext {
  readonly tenant: string;
  readonly repository: DataRecoveryOperationsRepository;
  readonly planId: string;
}

export interface DispatchResult {
  readonly dispatchId: string;
  readonly tenant: string;
  readonly reports: readonly OperationsAnalyticsReport[];
  readonly emittedSignalCount: number;
}

const toDispatchId = (tenant: string, planId: string): string =>
  `${tenant}-${planId}-${Date.now()}` as string;

const collectSignals = (snapshot: SessionSnapshot): readonly RecoverySignal[] => {
  if (snapshot.sessions.length === 0) return [];
  return snapshot.sessions.flatMap((session) => session.signals);
};

export const buildDispatchSignalsReport = (tenant: string, snapshot: SessionSnapshot): OperationsAnalyticsReport => {
  const allSignals = collectSignals(snapshot);
  const report = buildOperationsReport({
    tenant,
    signals: allSignals,
    sessions: snapshot.sessions,
    decisions: toSessionDecisions(snapshot.decisions),
    assessments: [],
  });
  return enrichScoredSessions(snapshot.sessions).length
    ? summarizeAggregateSignals({
        tenant,
        sessions: enrichScoredSessions(snapshot.sessions),
        signals: allSignals,
        assessments: [],
      })
    : report;
};

const publishRoute = async (reports: readonly OperationsAnalyticsReport[]): Promise<void> => {
  for (const report of reports) {
    await routeSummaryReport(report, []);
  }
};

export const dispatchPlanSignals = async (context: DispatchContext): Promise<DispatchResult> => {
  const runOrchestrator = createOrchestrator({
    repository: context.repository,
    publisher: {} as never,
  });
  const timeline = await runOrchestrator.getAuditTrail(context.planId);
  const session = await context.repository.loadLatestSnapshot(context.tenant);
  const snapshot: SessionSnapshot = {
    sessions: session?.sessions ?? [],
    sessionsByStatus: {} as SessionSnapshot['sessionsByStatus'],
    signalDensityTrend: [Math.max(0, timeline.length)],
    decisions: session?.latestDecision ? [session.latestDecision] : [],
    sessionsCount: session?.sessions.length ?? 0,
  };

  const report = buildDispatchSignalsReport(context.tenant, snapshot);
  await publishRoute([report]);

  return {
    dispatchId: toDispatchId(context.tenant, context.planId),
    tenant: context.tenant,
    reports: [report],
    emittedSignalCount: report.signalDensity.reduce((sum, density) => sum + density.signalCount, 0),
  };
};
