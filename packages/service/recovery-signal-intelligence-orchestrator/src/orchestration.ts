import type { SignalBundle } from '@domain/recovery-signal-orchestration-models';
import { SignalStore } from '@data/recovery-signal-intelligence-store';
import { CampaignRepository } from '@data/recovery-signal-orchestration-store';
import { type CampaignRun, type CampaignState, createRunId as createCampaignRunId } from '@domain/recovery-signal-orchestration-models';
import {
  buildCampaignBlueprint,
  buildEnvelope,
  isHighRiskMode,
} from './strategies';
import {
  validateSignalBundle,
  validatePlanEnvelope,
  validateConstraint,
  validateEnvelope,
} from './validation';
import { CampaignScheduler } from './schedulers';
import {
  buildRiskProfile,
  type CampaignRun as RiskProfileRun,
} from '@domain/recovery-signal-orchestration-models';

export interface OrchestrationWorkspace {
  readonly campaignCount: number;
  readonly activeCount: number;
  readonly completedCount: number;
}

const nowRun = (planId: string, state: CampaignState, score: number): CampaignRun => ({
  id: createCampaignRunId(planId),
  planId,
  state,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  stepCursor: 0,
  completedSteps: [],
  score,
  risk: 0,
});

export class RecoverySignalWorkspace {
  private readonly repository: CampaignRepository;
  private readonly scheduler: CampaignScheduler;

  constructor(
    private readonly store: SignalStore,
    repository?: CampaignRepository,
    scheduler?: CampaignScheduler,
  ) {
    this.repository = repository ?? new CampaignRepository();
    this.scheduler = scheduler ?? new CampaignScheduler();
  }

  onboardBundle(bundle: SignalBundle, actor: string): OrchestrationWorkspace {
    const validation = validateSignalBundle(bundle);
    if (!validation.isValid) {
      throw new Error(validation.messages.join(', '));
    }

    const { plan } = buildCampaignBlueprint(bundle, actor);
    const constraintsValidation = validateConstraint(plan.constraints);
    if (!constraintsValidation.ok) {
      throw constraintsValidation.error;
    }
    const planIntegrity = validatePlanEnvelope(plan, nowRun(plan.id, 'queued', 0.2));
    if (!planIntegrity.isValid) {
      throw new Error(planIntegrity.messages.join(', '));
    }

    const envelope = buildEnvelope(bundle, actor);
    const envelopeValidation = validateEnvelope(envelope);
    if (!envelopeValidation.isValid) {
      throw new Error(envelopeValidation.messages.join(', '));
    }

    const run: CampaignRun = {
      id: createCampaignRunId(plan.id),
      planId: plan.id,
      state: 'queued',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      stepCursor: 0,
      completedSteps: [],
      score: plan.signals.length === 0 ? 0 : Number((1 / plan.signals.length).toFixed(4)),
      risk: isHighRiskMode(plan) ? 0.72 : 0.31,
    };

    this.repository.saveCampaign(envelope, plan, run);
    this.scheduler.enqueue({
      plan,
      run,
      nextPulseMinutes: Math.max(1, plan.timeline.length),
    });

    return this.report();
  }

  executeCycle(): OrchestrationWorkspace {
    const result = this.scheduler.runTick();
    return {
      campaignCount: result.executed,
      activeCount: result.deferred,
      completedCount: result.completed,
    };
  }

  report(): OrchestrationWorkspace {
    const snapshot = this.repository.stateSnapshot();
    return {
      campaignCount: snapshot.totalCampaigns,
      activeCount: snapshot.states.active,
      completedCount: snapshot.states.completed,
    };
  }

  riskProfile(bundleId: string) {
    const matches = this.repository.getRunHistory(bundleId);
    const run = matches[0] as RiskProfileRun | undefined;
    if (!run) {
      return undefined;
    }
    return buildRiskProfile(
      'tenant-unknown',
      {
      id: run.planId,
      tenantId: 'tenant-unknown',
      facilityId: 'facility-unknown',
      mode: 'steady',
      constraints: {
        minSignals: 1,
        maxSignals: 10,
        maxConcurrentDimensionMix: 2,
        minDimensionCoverage: 0.2,
        minimumConfidence: 0.4,
      },
      score: 0.25,
      signals: [],
      timeline: [],
      createdAt: new Date().toISOString(),
      owner: 'ops',
    },
      run,
    );
  }
}

export const createWorkspace = (): RecoverySignalWorkspace => new RecoverySignalWorkspace(new SignalStore());
