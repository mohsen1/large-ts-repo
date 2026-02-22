import { withBrand } from '@shared/core';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { RecoveryOperationsQueuePublisher } from '@infrastructure/recovery-operations-queue';
import type { RecoverySignal, RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { buildCommandIntentMatrix, summarizeIntentMatrix } from '@domain/recovery-operations-models/command-intent';
import { buildPortfolioForecast, summarizePortfolioForecast } from '@domain/recovery-operations-models/portfolio-forecast';
import { makeCommandPlan, toDotGraph, type CommandGraphPlan } from '@domain/recovery-operations-models/command-graph';
import { buildReadinessSnapshot } from '@domain/recovery-operations-models/operations-readiness';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { buildOperationsReport, parseMetricWindow } from '@data/recovery-operations-analytics/aggregation';
import type { OperationsAnalyticsReport } from '@data/recovery-operations-analytics/types';

export interface CommandCenterInput {
  readonly tenant: string;
  readonly repository: RecoveryOperationsRepository;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly session: RunSession;
  readonly snapshot: RunPlanSnapshot;
  readonly signals: readonly RecoverySignal[];
}

export interface CommandCenterOutput {
  readonly commandSummary: string;
  readonly forecastSummary: string;
  readonly readinessSummary: string;
  readonly commandPlan: CommandGraphPlan;
  readonly graphDot: string;
  readonly analyticsReport: OperationsAnalyticsReport;
}

const createAssessments = (tenant: string, signals: readonly RecoverySignal[]) =>
  signals.map((signal) => ({
    runId: tenant,
    tenant,
    bucket: signal.severity > 8 ? 'critical' : signal.severity > 5 ? 'high' : 'low',
    riskScore: signal.severity,
    confidence: signal.confidence,
    intensity: signal.severity,
    constraints: [],
    reasoning: [`source=${signal.source}`],
    source: signal.source,
    createdAt: new Date().toISOString(),
  }));

export class OperationsCommandCenter {
  private readonly queue = new RecoveryOperationsQueuePublisher({ queueUrl: 'mock://recovery-operations-command-center' });

  async run(input: CommandCenterInput): Promise<CommandCenterOutput> {
    const intent = buildCommandIntentMatrix(input.session, input.snapshot, input.readinessPlan);
    const commandPlan = makeCommandPlan(input.tenant, String(input.session.runId), input.snapshot.program, intent.slots);
    const forecast = buildPortfolioForecast(input.session, input.snapshot, input.readinessPlan);
    const readinessSnapshot = buildReadinessSnapshot(input.tenant, input.session, input.snapshot, input.readinessPlan);

    const window = parseMetricWindow({
      from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
      zone: 'UTC',
      kind: 'hour',
    });
    const analyticsReport = buildOperationsReport({
      tenant: input.tenant,
      signals: [...input.signals],
      sessions: [input.session],
      decisions: [],
      assessments: createAssessments(input.tenant, input.signals),
    } as any);

    const adjusted = { ...analyticsReport, window, approvals: analyticsReport.approvals } as OperationsAnalyticsReport;
    void adjusted;

    await input.repository.upsertPlan(input.snapshot);
    await this.queue.publishPayload({
      eventId: withBrand(`${input.tenant}:command-center:${Date.now()}`, 'RecoveryRouteKey'),
      tenant: withBrand(input.tenant, 'TenantId'),
      payload: {
        commandPlan,
        forecast,
        readiness: readinessSnapshot,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      commandSummary: summarizeIntentMatrix(intent),
      forecastSummary: summarizePortfolioForecast(forecast),
      readinessSummary: readinessSnapshot.recommendation,
      commandPlan,
      graphDot: toDotGraph(commandPlan.graph),
      analyticsReport: adjusted,
    };
  }
}

export const runRecoveryCommandCenter = async (input: CommandCenterInput): Promise<CommandCenterOutput> => {
  const center = new OperationsCommandCenter();
  return center.run(input);
};
