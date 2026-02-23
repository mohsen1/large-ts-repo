import type { LabRunRecord, LabQueryFilter, LabStoreSnapshot } from '@data/recovery-ops-orchestration-lab-store';
import { RecoveryOpsOrchestrationLabStore } from '@data/recovery-ops-orchestration-lab-store';
import { summarizeStore, rankSignals } from '@data/recovery-ops-orchestration-lab-store';
import {
  type OrchestrationLab,
  type OrchestrationPolicy,
  type LabExecution,
  type LabRunId,
  type OrchestrationLabEnvelope,
  type LabPlan,
} from '@domain/recovery-ops-orchestration-lab';
import { buildLabWorkspace, summarizeLab, buildSegments, collectTimelineEvents } from '@domain/recovery-ops-orchestration-lab';
import { OrchestrationLabStoreAdapter } from './lab-adapter';
import type { OrchestrationLabServiceDeps, OrchestrationLabDashboard } from './lab-types';

export class RecoveryOpsOrchestrationService {
  private readonly store: RecoveryOpsOrchestrationLabStore;
  private readonly adapter: OrchestrationLabStoreAdapter;

  constructor(private readonly deps: OrchestrationLabServiceDeps) {
    this.store = new RecoveryOpsOrchestrationLabStore();
    this.adapter = new OrchestrationLabStoreAdapter(this.store, deps.policy);
  }

  async registerLab(lab: OrchestrationLab): Promise<OrchestrationLabEnvelope> {
    const workspace = this.adapter.snapshotWorkspace(lab);
    await this.store.upsertEnvelope(workspace.envelope);
    await this.adapter.saveRun(workspace.envelope.lab);
    return workspace.envelope;
  }

  async selectPlan(lab: OrchestrationLab, planId: LabPlan['id']): Promise<LabExecution> {
    const output = buildLabWorkspace({ lab, policy: this.deps.policy });
    const selected = output.envelope.plans.find((plan) => plan.id === planId);
    const plan = selected ?? output.envelope.plans[0];
    if (!plan) {
      throw new Error('no-plans-to-select');
    }

    const execution: LabExecution = {
      id: `${plan.id}:${Date.now()}` as LabRunId,
      planId: plan.id,
      labId: lab.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      stepCount: plan.steps.length,
      logs: ['selected', `plan=${plan.id}`],
      metadata: {
        executionWindow: output.envelope.intent.urgency,
      },
    };

    await this.store.recordRun({
      runId: execution.id,
      labId: lab.id,
      planId: plan.id,
      startedAt: execution.startedAt,
      status: execution.status,
      logs: execution.logs,
    });

    return await this.deps.runner.runPlan(plan);
  }

  async queryLab(filter: LabQueryFilter): Promise<OrchestrationLab[]> {
    const page = this.store.searchEnvelopes(filter);
    return page.data.map((entry) => entry.lab);
  }

  async queryRuns(filter: LabQueryFilter): Promise<readonly LabRunRecord[]> {
    return this.store.searchRuns(filter).data;
  }

  async dashboardSnapshot(lab: OrchestrationLab): Promise<OrchestrationLabDashboard> {
    const summary = summarizeLab(lab, []);
    const events = collectTimelineEvents(lab);
    const segments = buildSegments(events);

    return {
      id: lab.id,
      signalSeries: rankSignals(lab),
      latestEvents: segments.map((segment) => ({
        id: `${segment.label}:${segment.from}`,
        labId: lab.id,
        kind: 'run',
        timestamp: segment.from,
        actor: 'service',
        detail: segment.label,
        metadata: {
          label: segment.label,
          health: segment.health,
        },
      })),
      scores: [],
      summary: {
        totalSignals: summary.totalSignals,
        criticalSignals: summary.criticalSignals,
      },
    };
  }

  async snapshot(): Promise<LabStoreSnapshot> {
    const snapshot = await this.store.snapshot();
    const envelopes = snapshot.labs.map((lab) => {
      const envelope: OrchestrationLabEnvelope = {
        id: `${lab.id}:aggregate` as OrchestrationLabEnvelope['id'],
        state: 'draft',
        lab,
        intent: {
          tenantId: lab.tenantId,
          siteId: 'default',
          urgency: 'normal',
          rationale: 'snapshot',
          owner: lab.tenantId,
          requestedAt: new Date().toISOString(),
          tags: ['snapshot'],
        },
        plans: lab.plans,
        windows: lab.windows,
        metadata: {},
        revision: 0,
      };
      return envelope;
    });

    const summary = summarizeStore(envelopes, snapshot.runs);
    return {
      ...snapshot,
      summary,
    };
  }
}
