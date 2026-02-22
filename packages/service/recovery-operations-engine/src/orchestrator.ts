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
import { RecoveryOperationsPolicyEngine, type PolicyEngine } from '@service/recovery-operations-policy-engine';
import {
  InMemoryRecoveryGovernanceRepository,
  type RecoveryGovernanceRepository,
} from '@data/recovery-operations-governance-store';
import { NoopCompliancePublisher, type CompliancePublisher } from '@infrastructure/recovery-operations-compliance';
import type {
  RecoverySignal,
  RunPlanSnapshot,
  SessionDecision,
} from '@domain/recovery-operations-models';
import { buildPlan, envelopeForPlan, shouldRejectPlan } from './plan';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { IncidentClass } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

interface OrchestratorDeps {
  readonly repository: RecoveryOperationsRepository;
  readonly publisher: RecoveryOperationsQueuePublisher;
  readonly policyEngine?: PolicyEngine;
  readonly governanceStore?: RecoveryGovernanceRepository;
  readonly policyPublisher?: CompliancePublisher;
}

type RunState = ReturnType<typeof initializeTimeline>;

const runIdToRunState = new Map<string, RunState>();

export class RecoveryOperationsOrchestrator {
  private readonly policyEngine: PolicyEngine;
  private readonly governanceStore: RecoveryGovernanceRepository;
  private readonly policyPublisher: CompliancePublisher;

  constructor(private readonly deps: OrchestratorDeps) {
    this.policyEngine = deps.policyEngine ?? new RecoveryOperationsPolicyEngine();
    this.governanceStore = deps.governanceStore ?? new InMemoryRecoveryGovernanceRepository();
    this.policyPublisher = deps.policyPublisher ?? new NoopCompliancePublisher();
  }

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
    const region = readinessPlan.targets[0]?.region ?? 'us-east-1';
    const serviceFamily = readinessPlan.targets[0]?.ownerTeam ?? readinessPlan.metadata.owner;
    const fallbackMinutes = Math.max(10, (new Date(readinessPlan.windows[0]?.toUtc).getTime() - new Date(readinessPlan.windows[0]?.fromUtc).getTime()) / (1000 * 60));
    const impactClass: IncidentClass = readinessPlan.riskBand === 'red' ? 'infrastructure' : readinessPlan.riskBand === 'amber' ? 'database' : 'application';

    const candidate = {
      program,
      readinessPlan,
      signals,
      fingerprint: {
        tenant: withBrand(readinessPlan.metadata.owner, 'TenantId'),
        region,
        serviceFamily,
        impactClass,
        estimatedRecoveryMinutes: Number.isFinite(fallbackMinutes)
          ? fallbackMinutes
          : Math.max(10, readinessPlan.targets.length * 5),
      },
    };

    if (shouldRejectPlan(candidate)) {
      throw new Error('Plan rejected due to risk policy');
    }

    const planned = buildPlan(candidate);
    const policyDecision = await this.policyEngine.runChecksFromContext({
      runId: planned.runId,
      tenant: candidate.fingerprint.tenant,
      runStatus: 'running',
      program: candidate.program,
      fingerprint: candidate.fingerprint,
      readinessPlan,
      signals,
      policyRepository: this.governanceStore,
      publisher: this.policyPublisher,
    });

    if (!policyDecision.ok && policyDecision.error === 'POLICY_BLOCKED') {
      throw new Error('Plan creation blocked by policy engine');
    }
    if (policyDecision.ok && policyDecision.value.decision === 'block') {
      throw new Error('Plan creation blocked by governance policy');
    }

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
