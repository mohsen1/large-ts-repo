import { fail, ok, type Result } from '@shared/result';
import {
  computeReadinessScore,
  computeStepCoverage,
  buildMetricSeries,
} from '@domain/recovery-operations-models/rehearsal-metrics';
import {
  createRehearsalEnvelope,
  parseRehearsalPlan,
  type RehearsalExecutionRecord,
  type RehearsalExecutionState,
  type RehearsalId,
  type RehearsalPlan,
  type RehearsalQueryFilter,
  type RehearsalRunId,
  type RehearsalSignal,
  type RehearsalStep,
  type RehearsalSummary,
  type RehearsalWindow,
} from '@domain/recovery-operations-models/rehearsal-plan';
import {
  InMemoryRehearsalRepository,
  type RehearsalRepository,
  asRehearsalSnapshot,
} from '@data/recovery-operations-store';
import {
  InMemoryRehearsalTransport,
  type RehearsalTransport,
} from '@infrastructure/recovery-operations-queue';
import { withBrand } from '@shared/core';

export interface RehearsalOrchestratorOptions {
  readonly repository?: RehearsalRepository;
  readonly transport?: RehearsalTransport;
}

export interface RehearsalRunInput {
  readonly tenant: string;
  readonly signalSeed: readonly RehearsalSignal[];
  readonly planSeed: unknown;
}

export interface RehearsalProgress {
  readonly runId: RehearsalRunId;
  readonly status: RehearsalExecutionRecord['status'];
  readonly completed: boolean;
  readonly summary: RehearsalSummary;
  readonly coverage: number;
}

export interface RehearsalSnapshot {
  readonly runId: RehearsalRunId;
  readonly tenant: string;
  readonly planId: RehearsalId;
  readonly status: RehearsalExecutionRecord['status'];
  readonly steps: readonly RehearsalStep[];
  readonly summary: RehearsalSummary;
}

const nowIso = (): string => new Date().toISOString();
const durationMinutes = (startAt: string, endAt: string): number => {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 60_000));
};

export class RecoveryRehearsalOrchestrator {
  private readonly repository: RehearsalRepository;
  private readonly transport: RehearsalTransport;

  constructor(private readonly options: RehearsalOrchestratorOptions = {}) {
    this.repository = options.repository ?? new InMemoryRehearsalRepository();
    this.transport = options.transport ?? new InMemoryRehearsalTransport();
  }

  async launch(input: RehearsalRunInput): Promise<Result<RehearsalProgress, string>> {
    const parsedPlan = parseRehearsalPlan(input.planSeed);
    const startedAt = nowIso();

    await this.repository.savePlan(parsedPlan);

    const signals = input.signalSeed.map((signal) => ({
      ...signal,
      runId: parsedPlan.runId,
      tenant: withBrand(input.tenant, 'TenantId'),
      observedAt: nowIso(),
    }));

    await this.repository.appendSignals(parsedPlan.runId, signals);
    await this.transport.publishPlan(parsedPlan);

    const window: RehearsalWindow = {
      from: startedAt,
      to: new Date(Date.now() + parsedPlan.budget.timeoutMinutes * 60_000).toISOString(),
      zone: 'UTC',
    };

    const summary: RehearsalSummary = {
      planId: parsedPlan.id,
      tenant: withBrand(input.tenant, 'TenantId'),
      status: 'running',
      completedSteps: 0,
      totalSteps: parsedPlan.steps.length,
      riskSignalCount: signals.length,
      readinessScore: 0,
      durationMinutes: 0,
      finalizedAt: undefined,
    };

    const record: RehearsalExecutionRecord = {
      runId: parsedPlan.runId,
      planId: parsedPlan.id,
      startedAt,
      status: 'running',
      timeline: parsedPlan.steps,
      summary: {
        ...summary,
        readinessScore: computeReadinessScore(summary, computeStepCoverage(parsedPlan.steps), [window]),
      },
    };

    await this.repository.appendExecution(record);

    const envelope = createRehearsalEnvelope(input.tenant, {
      runId: String(parsedPlan.runId),
      signalCount: signals.length,
    });
    await this.transport.publishEnvelope(envelope);

    const metricSeries = buildMetricSeries(withBrand(input.tenant, 'TenantId'), record, {
      tenant: withBrand(input.tenant, 'TenantId'),
      runId: parsedPlan.runId,
      mode: [parsedPlan.mode],
      riskLevel: [parsedPlan.riskLevel],
      status: ['running'],
    } as RehearsalQueryFilter);

    if (metricSeries.summary.totalSteps === 0) {
      await this.failExecution(parsedPlan.runId, 'EMPTY_PLAN');
      return fail('REHEARSAL_EMPTY_PLAN');
    }

    return ok({
      runId: parsedPlan.runId,
      status: record.status,
      completed: false,
      summary: record.summary,
      coverage: computeStepCoverage(parsedPlan.steps),
    });
  }

  async advance(runId: RehearsalRunId): Promise<Result<RehearsalProgress, string>> {
    const execution = await this.repository.latestExecution(runId);
    const plan = await this.repository.loadPlan(runId);

    if (!execution || !plan) {
      return fail('REHEARSAL_NOT_FOUND');
    }

    const timeline = execution.timeline;
    const next = timeline.find((step) => step.status === 'not-started');
    if (!next) {
      const completed: RehearsalExecutionRecord = {
        ...execution,
        status: 'completed',
        summary: {
          ...execution.summary,
          status: 'completed',
          completedSteps: execution.summary.totalSteps,
          finalizedAt: nowIso(),
          durationMinutes: durationMinutes(execution.startedAt, nowIso()),
        },
      };
      await this.repository.appendExecution(completed);
      return ok({
        runId,
        status: completed.status,
        completed: true,
        summary: completed.summary,
        coverage: 1,
      });
    }

    const updatedTimeline = timeline.map((step) => {
      if (step.id !== next.id) return step;
      return {
        ...step,
        status: 'success' as const,
        startedAt: step.startedAt ?? nowIso(),
        completedAt: nowIso(),
      };
    });

    const completedSteps = updatedTimeline.filter((step) => step.status === 'success').length;
    const status: RehearsalExecutionState =
      completedSteps === execution.summary.totalSteps ? 'completed' : 'running';

    const updated: RehearsalExecutionRecord = {
      ...execution,
      status,
      timeline: updatedTimeline,
      summary: {
        ...execution.summary,
        status,
        completedSteps,
        durationMinutes: durationMinutes(execution.startedAt, nowIso()),
        finalizedAt: status === 'completed' ? nowIso() : undefined,
      },
    };

    await this.repository.appendExecution(updated);
    await this.transport.publishSignal(buildProgressSignal(runId, status, updatedTimeline));

    return ok({
      runId,
      status,
      completed: status === 'completed',
      summary: updated.summary,
      coverage: computeStepCoverage(updated.timeline),
    });
  }

  async list(filter?: RehearsalQueryFilter): Promise<readonly RehearsalPlan[]> {
    return this.repository.queryPlans(filter);
  }

  async snapshot(runId: RehearsalRunId): Promise<RehearsalSnapshot | undefined> {
    const result = await asRehearsalSnapshot(this.repository, runId);
    if (!result) return undefined;
    return {
      ...result,
      tenant: String(result.tenant),
    };
  }

  async failExecution(runId: RehearsalRunId, reason: string): Promise<Result<void, string>> {
    const execution = await this.repository.latestExecution(runId);
    if (!execution) return fail('REHEARSAL_NOT_FOUND');

    const failed: RehearsalExecutionRecord = {
      ...execution,
      status: 'failed',
      summary: {
        ...execution.summary,
        status: 'failed',
        finalizedAt: nowIso(),
      },
    };

    await this.repository.appendExecution(failed);
    await this.transport.publishSignal(buildFailureSignal(runId, reason));
    return ok(undefined);
  }
}

const buildProgressSignal = (
  runId: RehearsalRunId,
  status: RehearsalExecutionState,
  timeline: readonly RehearsalStep[],
): RehearsalSignal => ({
  id: `${runId}-${status}`,
  runId,
  tenant: withBrand(runId, 'TenantId'),
  source: 'rehearsal-orchestrator',
  category: 'metric',
  severity: status === 'completed' ? 1 : 4,
  confidence: 0.8,
  observedAt: nowIso(),
  context: {
    status,
    steps: timeline.length,
  },
});

const buildFailureSignal = (runId: RehearsalRunId, reason: string): RehearsalSignal => ({
  id: `${runId}-failed`,
  runId,
  tenant: withBrand(runId, 'TenantId'),
  source: 'rehearsal-orchestrator',
  category: 'audit',
  severity: 9,
  confidence: 0.99,
  observedAt: nowIso(),
  context: {
    reason,
  },
});

export { InMemoryRehearsalTransport };
export { createRehearsalEnvelope, buildMetricSeries };
