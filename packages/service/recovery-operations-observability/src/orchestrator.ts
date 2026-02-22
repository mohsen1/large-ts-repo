import { createEnvelope, type Envelope } from '@shared/protocol';
import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import { runIntelligencePipeline } from '@service/recovery-operations-intelligence-orchestrator';
import { MemoryIntelligenceStore } from '@data/recovery-operations-intelligence-store';
import {
  buildOperationsReport,
  enrichScoredSessions,
  routeSummaryReport,
  summarizeAggregateSignals,
} from '@data/recovery-operations-analytics';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { OperationsAnalyticsReport } from '@data/recovery-operations-analytics';
import { InMemoryReportPublisher, signalId } from './adapters';
import { defaultFleetPolicy, type FleetPolicy, type OperationsObservabilityOutput, type ObservabilityDeps, type ReportPublisher, type RecoveryOperationsObservabilityService, type OperationsObservabilityRunId } from './types';

const pickPolicy = (policy?: FleetPolicy): FleetPolicy => policy ?? defaultFleetPolicy;
type LoadedSnapshot = Awaited<ReturnType<RecoveryOperationsRepository['loadLatestSnapshot']>>;

const normalizeWindowMs = (minutes: number): number => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return defaultFleetPolicy.minWindowMinutes * 60_000;
  }

  return Math.max(1, minutes) * 60_000;
};

const makeRunId = (tenant: string): OperationsObservabilityRunId => withBrand(`${tenant}-obs-${Date.now()}`, 'OperationsObservabilityRunId');

const buildFallbackReport = (tenant: string): OperationsAnalyticsReport => ({
  tenant,
  window: {
    from: new Date(Date.now() - defaultFleetPolicy.minWindowMinutes * 60_000).toISOString(),
    to: new Date().toISOString(),
    zone: 'UTC',
    kind: 'hour',
  },
  signalDensity: [],
  scoreTrend: {
    direction: 'flat',
    points: [],
  },
  runCoverage: 0,
  approvals: {
    total: 0,
    accepted: 0,
    rejectionRate: 0,
  },
  riskBands: {
    green: 0,
    amber: 0,
    red: 0,
  },
  createdAt: new Date().toISOString(),
});

export interface RecoveryOperationsObservabilityServiceDeps {
  readonly deps: ObservabilityDeps;
  readonly publisher?: ReportPublisher;
}

export class RecoveryOperationsObservabilityServiceImpl implements RecoveryOperationsObservabilityService {
  private readonly policy: FleetPolicy;
  private readonly publisher: ReportPublisher;

  constructor(
    private readonly deps: ObservabilityDeps,
    publisher?: ReportPublisher,
  ) {
    this.policy = pickPolicy(deps.policy);
    this.publisher = publisher ?? new InMemoryReportPublisher();
  }

  async observe(tenant: string): Promise<OperationsObservabilityOutput | undefined> {
    return this.observeBatch(tenant, this.policy.minWindowMinutes);
  }

  async observeBatch(tenant: string, windowMinutes: number): Promise<OperationsObservabilityOutput | undefined> {
    const windowMs = normalizeWindowMs(windowMinutes);
    const snapshot = await this.deps.repository.loadLatestSnapshot(tenant);

    if (!snapshot || snapshot.sessions.length === 0) {
      if (!this.policy.emitNoDataAsZero) {
        return undefined;
      }

      return this.publishOutput(tenant, [buildFallbackReport(tenant)]);
    }

    const report = buildOperationsReport({
      tenant,
      signals: snapshot.sessions.flatMap((session) => session.signals),
      sessions: snapshot.sessions,
      decisions: snapshot.latestDecision ? [snapshot.latestDecision] : [],
      assessments: [],
    });

    const scored = enrichScoredSessions(snapshot.sessions);
    const aggregate = summarizeAggregateSignals({
      tenant,
      sessions: scored,
      signals: snapshot.sessions.flatMap((session) => session.signals),
      assessments: [],
    });

    const output: OperationsObservabilityOutput = {
      runId: makeRunId(tenant),
      tenant,
      reports: [report, aggregate],
    };

    await this.publishIntelligence(tenant, output, snapshot, windowMs);
    await this.publishOutputWithRouting(output, windowMs);

    return output;
  }

  private async publishOutputWithRouting(
    output: OperationsObservabilityOutput,
    windowMs: number,
  ): Promise<void> {
    for (const report of output.reports) {
      await this.publisher.publishRunSnapshot(report);
      await routeSummaryReport(report, [
        {
          publishReport: async () => Promise.resolve(),
          publishSnapshot: async () => Promise.resolve(),
        },
      ]);
    }

    await this.publisher.publishSignal(output);
    const events = this.buildEvents(output);

    for (const event of events) {
      await this.deps.bus.publish(event.eventType as any, event);
    }

    const context = `window=${windowMs}ms`;
    await this.publisher.publishError(output.tenant, context);
  }

  private buildEvents(output: OperationsObservabilityOutput): readonly Envelope<OperationsObservabilityOutput>[] {
    return output.reports.map((_, index) =>
      createEnvelope(`recovery.operations.observability.${output.tenant}.${index}`, {
        ...output,
        tenant: output.tenant,
        correlationId: signalId(output.tenant, output.runId),
      } as OperationsObservabilityOutput & { tenant: string; correlationId: string }),
    );
  }

  private async publishIntelligence(
    tenant: string,
    output: OperationsObservabilityOutput,
    snapshot: NonNullable<LoadedSnapshot>,
    windowMs: number,
  ): Promise<Result<void, string>> {
    const intelligenceStore = new MemoryIntelligenceStore();
    const signals = snapshot.sessions
      .flatMap((session) => session.signals)
      .map((signal) => ({
        runId: withBrand(`${tenant}-${signal.id}` as string, 'IntelligenceRunId'),
        envelopeId: `${signal.id}-${Date.now()}`,
        source: 'manual' as const,
        signal,
        window: {
          tenant: withBrand(tenant, 'TenantId'),
          from: new Date(Date.now() - windowMs).toISOString(),
          to: new Date().toISOString(),
          zone: 'UTC',
        },
        tags: ['observability', tenant, output.runId],
      }));

    const result = await runIntelligencePipeline(
      {
        tenant,
        runId: withBrand(`${output.runId}-pipeline`, 'IntelligenceRunId'),
        readinessPlan: {
          planId: withBrand(`${tenant}-readiness`, 'RecoveryReadinessPlanId'),
          runId: withBrand(`${tenant}-readiness-run`, 'ReadinessRunId'),
          title: 'Recovery Observability Plan',
          objective: 'Build observability signals during recovery planning',
          state: 'active',
          createdAt: new Date().toISOString(),
          targets: [],
          windows: [],
          signals: [],
          riskBand: 'amber',
          metadata: {
            owner: tenant,
            tags: ['observability', 'synthetic'],
            tenant,
          },
        },
        signals,
      },
      {
        operations: this.deps.repository,
        intelligence: intelligenceStore,
      },
    );

    if (!result.ok) {
      return fail(result.error);
    }

    return ok(undefined);
  }

  private async publishOutput(tenant: string, reports: readonly OperationsAnalyticsReport[]): Promise<OperationsObservabilityOutput> {
    const output: OperationsObservabilityOutput = {
      runId: makeRunId(tenant),
      tenant,
      reports,
    };

    await this.publishOutputWithRouting(output, defaultFleetPolicy.minWindowMinutes * 60_000);
    return output;
  }
}

export const createRecoveryOperationsObservabilityService = (deps: ObservabilityDeps, publisher?: ReportPublisher): RecoveryOperationsObservabilityService => {
  return new RecoveryOperationsObservabilityServiceImpl(deps, publisher);
};

export const routeSummaryBatch = async (
  input: readonly OperationsAnalyticsReport[],
): Promise<Result<void, string>> => {
  try {
    await Promise.all(
      input.map((report) => routeSummaryReport(report, [
        {
          publishReport: async () => Promise.resolve(),
          publishSnapshot: async () => Promise.resolve(),
        },
      ])),
    );
    return ok(undefined);
  } catch (error) {
    return fail((error as Error).message ?? 'SUMMARY_ROUTE_FAILED');
  }
};
