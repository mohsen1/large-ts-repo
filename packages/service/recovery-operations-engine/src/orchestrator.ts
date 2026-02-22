import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { RecoveryOperationsQueuePublisher, RecoveryOperationsConsumer } from '@infrastructure/recovery-operations-queue';
import { parseRunDecision } from '@domain/recovery-operations-models';
import {
  appendDecision,
  appendSignal,
  formatTimeline,
  initializeTimeline,
  type RunSession,
} from '@domain/recovery-operations-models';
import type {
  RecoverySignal,
  RunPlanSnapshot,
  SessionDecision,
} from '@domain/recovery-operations-models';
import { buildPlan, envelopeForPlan, shouldRejectPlan } from './plan';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

interface OrchestratorDeps {
  readonly repository: RecoveryOperationsRepository;
  readonly publisher: RecoveryOperationsQueuePublisher;
}

type RunState = ReturnType<typeof initializeTimeline>;

const runIdToRunState = new Map<string, RunState>();

export class RecoveryOperationsOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async ingestSignal(runId: string, signal: RecoverySignal): Promise<RunState | undefined> {
    const run = await this.deps.repository.loadSessionByRunId(runId);
    if (!run) return undefined;

    const timeline = runIdToRunState.get(run.runId) ?? initializeTimeline(run as RunSession);
    const updated = appendSignal(timeline, signal);
    runIdToRunState.set(run.runId, updated);
    return updated;
  }

  async createPlan(
    program: RecoveryProgram,
    readinessPlan: RecoveryReadinessPlan,
    signals: readonly RecoverySignal[],
  ): Promise<RunPlanSnapshot> {
    const candidate = {
      program,
      readinessPlan,
      signals,
      fingerprint: {
        tenant: readinessPlan.tenant,
        region: readinessPlan.region ?? 'us-east-1',
        serviceFamily: readinessPlan.service,
        impactClass: 'application',
        estimatedRecoveryMinutes: Math.max(10, readinessPlan.impactEstimateMinutes),
      },
    };

    if (shouldRejectPlan(candidate)) {
      throw new Error('Plan rejected due to risk policy');
    }

    const planned = buildPlan(candidate);
    await this.deps.repository.upsertPlan(planned.snapshot);
    await this.deps.publisher.publishPayload(envelopeForPlan(planned));
    return planned.snapshot;
  }

  async handleDecisionEnvelope(raw: string): Promise<void> {
    const decision = parseRunDecision(JSON.parse(raw));
    const decisionRecord: SessionDecision = {
      ...decision,
      ticketId: decision.ticketId,
      createdAt: new Date().toISOString(),
    };
    await this.deps.repository.upsertDecision(decisionRecord);

    const timeline = runIdToRunState.get(decisionRecord.runId) ??
      initializeTimeline((await this.deps.repository.loadSessionByRunId(decisionRecord.runId)) as RunSession);
    const updated = appendDecision(timeline, decisionRecord);
    runIdToRunState.set(decisionRecord.runId, updated);

    const consumer = new RecoveryOperationsConsumer({ repository: this.deps.repository });
    await consumer.ingestSignal(JSON.stringify({
      eventId: `${Date.now()}`,
      tenant: 'recovery-tenant',
      payload: {
        id: `signal-${Date.now()}`,
        source: 'engine',
        severity: decisionRecord.accepted ? 1 : 10,
        confidence: 0.8,
        detectedAt: new Date().toISOString(),
        details: { reasonCodes: decisionRecord.reasonCodes },
      },
      createdAt: new Date().toISOString(),
    }));
    void updated;
  }

  async getAuditTrail(runId: string): Promise<string[]> {
    const timeline = runIdToRunState.get(runId);
    return timeline ? formatTimeline(timeline) : [];
  }
}

export const createOrchestrator = (deps: OrchestratorDeps): RecoveryOperationsOrchestrator => {
  return new RecoveryOperationsOrchestrator(deps);
};
