import { z } from 'zod';
import { aggregateSignals, MemoryReadinessRepository } from '@data/recovery-readiness-store/src/repository';
import { buildPlanBlueprint, evaluateReadinessReadiness } from './planner';
import { EventBridgeReadinessPublisher } from './adapters';
import {
  type RecoveryReadinessPlanDraft,
  type RecoveryReadinessPlan,
  type ReadinessTarget,
  type ReadinessSignal,
  ReadinessPolicy
} from '@domain/recovery-readiness';

export const commandSchema = z.object({
  runId: z.string(),
  title: z.string(),
  owner: z.string(),
  targetIds: z.array(z.string())
});

export interface OrchestratorMetrics {
  runsStarted: number;
  runsCompleted: number;
  runsRejected: number;
}

export class RecoveryReadinessOrchestrator {
  private readonly repo = new MemoryReadinessRepository();
  private metrics: OrchestratorMetrics = { runsStarted: 0, runsCompleted: 0, runsRejected: 0 };

  constructor(
    private readonly policy: Omit<ReadinessPolicy, 'allowedRegions'> & { allowedRegions: string[] },
    private readonly publisher: EventBridgeReadinessPublisher
  ) {
    // no-op
  }

  async bootstrap(draft: RecoveryReadinessPlanDraft, signals: ReadinessSignal[]): Promise<string> {
    const decision = evaluateReadinessReadiness(signals, this.lookupTargets(draft.targetIds), {
      policyId: 'bootstrap',
      name: this.policy.name,
      constraints: {
        key: 'bootstrap',
        minWindowMinutes: 5,
        maxWindowMinutes: 480,
        minTargetCoveragePct: 25,
        forbidParallelity: false
      },
      allowedRegions: new Set(this.policy.allowedRegions),
      blockedSignalSources: []
    });

    if (!decision.canRun) {
      this.metrics.runsRejected += 1;
      return `rejected:${decision.reasons.join('|')}`;
    }

    const targets = this.lookupTargets(draft.targetIds);
    const plan = {
      ...buildPlanBlueprint(draft, targets),
      draft
    };
    const planId = `plan:${draft.runId}` as RecoveryReadinessPlan['planId'];
    const eventPayload = {
      planId,
      runId: draft.runId,
      title: draft.title,
      objective: draft.objective,
      state: 'draft' as RecoveryReadinessPlan['state'],
      createdAt: new Date().toISOString(),
      targets,
      windows: plan.windows,
      signals,
      riskBand: decision.plan.riskBand,
      metadata: { owner: draft.owner, tags: ['bootstrap'] }
    };
    const aggregateSignalWeight = await aggregateSignals(eventPayload, signals);

    const event = {
      action: 'created' as const,
      runId: draft.runId,
      payload: eventPayload
    };

    await this.repo.save({
      plan: event.payload,
      targets: event.payload.targets,
      signals,
      revision: aggregateSignalWeight,
      updatedAt: new Date().toISOString()
    });
    await this.publisher.publish({
      action: event.action,
      runId: event.runId,
      payload: event.payload
    });

    this.metrics.runsStarted += 1;
    this.metrics.runsCompleted += 1;
    return event.runId;
  }

  private lookupTargets(targetIds: string[]) {
    return targetIds.map((targetId): ReadinessTarget => ({
      id: targetId as ReadinessTarget['id'],
      name: `Target ${targetId}`,
      ownerTeam: 'operations',
      region: 'us-east-1',
      criticality: 'medium',
      owners: ['sre']
    }));
  }

  async status(): Promise<OrchestratorMetrics> {
    return { ...this.metrics };
  }
}
