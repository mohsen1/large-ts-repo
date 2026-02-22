import { z } from 'zod';
import { aggregateSignals, MemoryReadinessRepository } from '@data/recovery-readiness-store/src/repository';
import { buildPlanBlueprint, evaluateReadinessReadiness } from './planner';
import { EventBridgeReadinessPublisher } from './adapters';
import {
  type ReadinessRunId,
  type RecoveryReadinessPlanDraft,
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

    const plan = {
      ...buildPlanBlueprint(draft, this.lookupTargets(draft.targetIds)),
      draft
    };

    const aggregateSignalWeight = await aggregateSignals(plan.blueprint,
      signals);
    const event = {
      action: 'created' as const,
      runId: draft.runId,
      payload: {
        planId: `plan:${draft.runId}`,
        runId: draft.runId as ReadinessRunId,
        title: draft.title,
        objective: draft.objective,
        state: 'draft',
        createdAt: new Date().toISOString(),
        targets: this.lookupTargets(draft.targetIds),
        windows: plan.windows,
        signals,
        riskBand: decision.plan.riskBand,
        metadata: { owner: draft.owner, tags: ['bootstrap'] },
      }
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
    return targetIds.map((targetId) => ({
      id: targetId as never,
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
