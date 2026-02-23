import { buildLabWorkspace, pickPlanByPolicy } from '@domain/recovery-ops-orchestration-lab';
import { createLabState, summarizeDomainState, nextPlanCandidates, formatStateMetrics } from '@domain/recovery-ops-orchestration-lab';
import {
  RecoveryOpsOrchestrationLabStore,
  type LabRunRecord,
  type LabQueryFilter,
} from '@data/recovery-ops-orchestration-lab-store';
import type {
  OrchestrationLabServiceDeps,
  OrchestrationLabSelectionResult,
  OrchestrationLabRunResult,
  OrchestrationLabWorkspaceView,
} from './lab-types';
import type {
  OrchestrationLab,
  OrchestrationLabId,
  LabPlan,
} from '@domain/recovery-ops-orchestration-lab';

export class OrchestrationLabEngine {
  private readonly store: RecoveryOpsOrchestrationLabStore;
  private readonly policy: OrchestrationLabServiceDeps['policy'];
  private readonly runner: OrchestrationLabServiceDeps['runner'];

  constructor(deps: OrchestrationLabServiceDeps) {
    this.store = new RecoveryOpsOrchestrationLabStore();
    this.policy = deps.policy;
    this.runner = deps.runner;
  }

  async openWorkspace(lab: OrchestrationLab): Promise<OrchestrationLabWorkspaceView> {
    const workspace = buildLabWorkspace({ lab, policy: this.policy });
    await this.store.upsertEnvelope(workspace.envelope);

    return {
      lab,
      envelope: workspace.envelope,
      candidateCount: workspace.scores.length,
    };
  }

  async selectPlan(lab: OrchestrationLab, planId: LabPlan['id']): Promise<OrchestrationLabSelectionResult> {
    const workspace = await this.openWorkspace(lab);
    const selected = workspace.envelope.plans.find((plan) => plan.id === planId);
    const envelopeId = workspace.envelope.id;

    const selectedPlanId = selected?.id;
    return {
      envelopeId,
      selectedPlanId,
      planCount: workspace.envelope.plans.length,
      scoreCount: workspace.candidateCount,
    };
  }

  async runPlan(lab: OrchestrationLab, planId?: LabPlan['id']): Promise<OrchestrationLabRunResult> {
    const workspace = await this.openWorkspace(lab);
    const plan = workspace.envelope.plans.find((entry) => entry.id === planId) ?? pickPlanByPolicy(workspace.envelope, (left, right) => right.score - left.score);
    if (!plan) {
      throw new Error('run-no-plan');
    }

    const started = Date.now();
    const execution = await this.runner.runPlan(plan);
    const durationMs = Date.now() - started;

    await this.store.recordRun({
      runId: execution.id,
      labId: execution.labId,
      planId: execution.planId,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      status: execution.status,
      logs: execution.logs,
    });

    return {
      runId: execution.id,
      success: execution.status === 'succeeded',
      durationMs,
      stepCount: execution.stepCount,
    };
  }

  async query(filter: LabQueryFilter): Promise<readonly OrchestrationLabWorkspaceView[]> {
    const page = this.store.searchEnvelopes(filter);
    return page.data.map((envelope) => ({
      lab: envelope.lab,
      envelope,
      candidateCount: envelope.plans.length,
    }));
  }

  async workspaceSnapshot(lab: OrchestrationLab) {
    const workspace = await this.openWorkspace(lab);
    const adapter = createLabState(lab, this.policy);
    const summary = summarizeDomainState(adapter);
    const candidates = nextPlanCandidates(adapter);
    const metrics = formatStateMetrics(adapter);

    return {
      workspace,
      summary,
      metrics,
      candidates,
    };
  }

  async runs(filter: LabQueryFilter): Promise<readonly LabRunRecord[]> {
    return this.store.searchRuns(filter).data;
  }

  async workspaceForId(id: OrchestrationLabId): Promise<OrchestrationLabWorkspaceView | undefined> {
    const record = this.store.getEnvelope(String(id));
    if (!record) {
      return undefined;
    }
    return {
      lab: record.envelope.lab,
      envelope: record.envelope,
      candidateCount: record.envelope.plans.length,
    };
  }
}
