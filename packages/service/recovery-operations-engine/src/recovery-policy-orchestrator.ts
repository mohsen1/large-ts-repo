import { buildTimeline, summarizeTimeline, timelineToSignalMap } from '@domain/recovery-operations-models/operation-timeline';
import { buildRouteState, writeRoutesToRepository } from '@data/recovery-operations-store/realtime-routing';
import { SignalWorkflowManager, collectSignalsForTenant, summarizePolicy } from '@data/recovery-operations-store/signal-workflow';
import {
  evaluateRecoveryPolicy,
  RecoveryPolicyContext,
  type PolicyEvaluation,
} from '@domain/recovery-operations-models/recovery-policy-rules';
import { buildSignalPortfolio } from '@domain/recovery-operations-models/signal-portfolio';
import { draftRoutes } from '@domain/recovery-operations-models/route-intelligence';
import { withBrand } from '@shared/core';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryOperationsEnvelope, RecoverySignal } from '@domain/recovery-operations-models';
import { RecoveryOperationsQueuePublisher } from '@infrastructure/recovery-operations-queue';

export interface RecoveryPolicyOrchestratorInput {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
  readonly repository: RecoveryOperationsRepository;
}

export interface RecoveryPolicyOrchestratorState {
  readonly tenant: string;
  readonly policy: PolicyEvaluation;
  readonly routeCount: number;
  readonly timelineSummary: string;
  readonly queueSent: boolean;
}

interface RouteEnvelope {
  readonly timelineId: string;
  readonly routeCount: number;
  readonly routeMapSize: number;
}

export class RecoveryPolicyOrchestrator {
  private readonly workflowManagers = new Map<string, SignalWorkflowManager>();
  private queue = new RecoveryOperationsQueuePublisher({ queueUrl: 'mock://recovery-operations-orchestrator' });

  async orchestrate(input: RecoveryPolicyOrchestratorInput): Promise<RecoveryPolicyOrchestratorState> {
    const tenantSignals = input.envelopes.filter((entry) => entry.tenant === input.tenant).map((entry) => entry.payload);
    const portfolio = buildSignalPortfolio(input.tenant, tenantSignals);

    const context: RecoveryPolicyContext = {
      tenant: input.tenant,
      readiness: input.readinessPlan,
      portfolios: [portfolio],
      activeSignals: tenantSignals.length,
    };

    const policy = evaluateRecoveryPolicy(context);
    const draft = draftRoutes({
      tenant: input.tenant,
      readinessPlan: input.readinessPlan,
      envelopes: input.envelopes,
      policy,
    });
    const routeState = buildRouteState({ tenant: input.tenant, envelopes: input.envelopes, policy });
    const timeline = buildTimeline(input.tenant, withBrand(`${input.tenant}:policy:${Date.now()}`, 'RecoveryRunId'), draft.routeSet);
    const timelineSummary = summarizeTimeline(timeline);

    await writeRoutesToRepository(input.repository, routeState, input.envelopes);
    await input.repository.upsertPlan({
      id: withBrand(`${input.tenant}:${Date.now()}`, 'RunPlanId'),
      name: 'orchestrated-policy-plan',
      program: policy.policy as any,
      constraints: policy.policy.budget,
      fingerprint: {
        tenant: withBrand(input.tenant, 'TenantId'),
        region: 'global',
        serviceFamily: 'recovery-ops',
        impactClass: 'application',
        estimatedRecoveryMinutes: Math.max(1, policy.policy.budget.timeoutMinutes),
      },
      sourceSessionId: withBrand(`${input.tenant}:session`, 'RunSessionId'),
      effectiveAt: new Date().toISOString(),
    });

    const decisionRunId = withBrand(`${input.tenant}:run:${Date.now()}`, 'RecoveryRunId');

    const manager = this.workflowManagers.get(input.tenant) ?? new SignalWorkflowManager({ repository: input.repository, policy });
    const snapshot = await manager.buildSnapshot(
      input.tenant,
      String(decisionRunId),
      [portfolio],
      tenantSignals,
    );

    this.workflowManagers.set(input.tenant, manager);
    await manager.ingestSignalBundle(input.tenant, input.envelopes);
    await input.repository.upsertDecision({
      eventId: withBrand(`${snapshot.runId}`, 'RecoveryRunId') as string,
      payload: { ...snapshot },
      state: policy,
      accepted: policy.decision === 'allow',
    } as any);

    const routeMetadata: RouteEnvelope = {
      timelineId: timeline.timelineId,
      routeCount: draft.routeSet.length,
      routeMapSize: timelineToSignalMap(timeline, tenantSignals).size,
    };

    await this.queue.publishPayload({
      eventId: routeMetadata.timelineId as any,
      tenant: withBrand(input.tenant, 'TenantId'),
      payload: routeMetadata,
      createdAt: new Date().toISOString(),
    });

    return {
      tenant: input.tenant,
      policy,
      routeCount: draft.routeSet.length,
      timelineSummary,
      queueSent: true,
    };
  }

  summarizePolicy(policy: PolicyEvaluation): string {
    return summarizePolicy(policy.policy);
  }
}

export const createRecoveryPolicyOrchestrator = (): RecoveryPolicyOrchestrator => {
  return new RecoveryPolicyOrchestrator();
};

export const runRecoveryPolicyOrchestrator = async (
  repository: RecoveryOperationsRepository,
  tenant: string,
  readinessPlan: RecoveryReadinessPlan,
  envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): Promise<RecoveryPolicyOrchestratorState> => {
  const orchestrator = createRecoveryPolicyOrchestrator();
  return orchestrator.orchestrate({ tenant, readinessPlan, envelopes, repository });
};

export const collectSignalsByTenant = (
  tenant: string,
  envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): readonly RecoveryOperationsEnvelope<RecoverySignal>[] => {
  return envelopes.filter((entry) => entry.tenant === tenant);
};

export const collectSignalProfile = (
  tenant: string,
  envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): readonly RecoverySignal[] => {
  return collectSignalsByTenant(tenant, envelopes).map((entry) => ({ ...entry.payload }));
};

export const policyDecisionAllowed = (policy: PolicyEvaluation): boolean => policy.decision === 'allow';
