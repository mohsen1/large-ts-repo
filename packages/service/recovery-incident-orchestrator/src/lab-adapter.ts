import type { OrchestrationLab, OrchestrationPolicy, LabPlan, OrchestrationLabId, LabPlanId, LabRunId } from '@domain/recovery-ops-orchestration-lab';
import {
  brandCommandStepId,
  normalizePlans,
  createLabState,
  nextPlanCandidates,
  formatStateMetrics,
  summarizeDomainState,
  buildLabWorkspace,
} from '@domain/recovery-ops-orchestration-lab';
import type { RecoveryOpsOrchestrationLabStore as StoreType } from '@data/recovery-ops-orchestration-lab-store';
import type { OrchestrationLabServiceDeps, OrchestrationLabPlanResult, OrchestrationLabWorkspace } from './lab-types';

const toPlanLabel = (plan: LabPlan): string => `plan-${String(plan.id).slice(0, 8)}-${plan.steps.length}`;

export class OrchestrationLabStoreAdapter {
  constructor(private readonly store: StoreType, private readonly policy: OrchestrationPolicy) {}

  async persistEnvelope(lab: OrchestrationLab): Promise<OrchestrationLabPlanResult> {
    const output = buildLabWorkspace({ lab, policy: this.policy });
    const _ = brandCommandStepId(`cmd:${lab.id}`);
    const candidates = normalizePlans(output.envelope.plans);
    const selected = candidates[0];
    const topLabel = selected ? toPlanLabel(selected) : undefined;

    void _;
    void topLabel;

    await this.store.upsertEnvelope(output.envelope);

    return {
      envelopeId: output.envelope.id,
      planCount: output.envelope.plans.length,
      candidateCount: candidates.length,
      selectedPlanId: selected?.id,
      summary: {
        selectedPlanAllowed: !!selected,
        scoreCount: output.scores.length,
        bestPlan: selected,
      },
    };
  }

  async saveRun(lab: OrchestrationLab): Promise<void> {
    const selectedPlan = lab.plans[0];
    const planId = selectedPlan?.id ?? `${String(lab.id)}:default-plan` as LabPlanId;
    const runId = `${String(lab.id)}:${String(planId)}:seed` as LabRunId;
    await this.store.recordRun({
      runId,
      labId: lab.id,
      planId,
      startedAt: new Date().toISOString(),
      logs: [topPlanRunLog(String(planId))],
      status: 'running',
    });
  }

  snapshotWorkspace(lab: OrchestrationLab): OrchestrationLabWorkspace {
    const adapter = createLabState(lab, this.policy);
    const summary = summarizeDomainState(adapter);
    const candidates = nextPlanCandidates(adapter);

    return {
      envelope: adapter.envelope,
      policies: {
        selectedPlanAllowed: candidates.length > 0,
        scoreCount: adapter.scores.length,
        bestPlan: candidates[0],
      },
      topSignalCount: summary.totalSignals,
    };
  }

  formattedMetrics(lab: OrchestrationLab): string[] {
    const adapter = createLabState(lab, this.policy);
    return formatStateMetrics(adapter);
  }
}

const topPlanRunLog = (planId: string): string => `run-plan:${planId}:${Date.now()}`;
