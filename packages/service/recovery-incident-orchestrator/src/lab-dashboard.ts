import { summarizeStore, computeAnalytics } from '@data/recovery-ops-orchestration-lab-store';
import { RecoveryOpsOrchestrationLabStore } from '@data/recovery-ops-orchestration-lab-store';
import type { OrchestrationLabWorkspaceQuery } from './lab-types';
import type { LabQueryFilter, LabRunRecord } from '@data/recovery-ops-orchestration-lab-store';
import type { OrchestrationLab } from '@domain/recovery-ops-orchestration-lab';

export class OrchestrationWorkspaceDashboard {
  private readonly store = new RecoveryOpsOrchestrationLabStore();

  async list(filter: LabQueryFilter): Promise<OrchestrationLabWorkspaceQuery> {
    const runPage = this.store.searchRuns(filter);
    const envelopePage = this.store.searchEnvelopes(filter);
    const workspaces = envelopePage.data.map((envelope) => ({
      lab: envelope.lab,
      envelope,
      candidateCount: envelope.plans.length,
    }));

    return {
      filter,
      refresh: async () => {
        return;
      },
      workspaces,
      runs: runPage.data,
    };
  }

  async inspect(): Promise<{
    readonly totalRuns: number;
    readonly topTenant: string;
    readonly latestRunAt: string | undefined;
    readonly criticalPlanCoverage: number;
  }> {
    const snapshot = await this.store.snapshot();
    const envelopes = snapshot.labs.map((lab) => ({
      id: `${lab.id}` as any,
      state: 'draft',
      lab,
      intent: {
        tenantId: lab.tenantId,
        siteId: 'default',
        urgency: 'normal',
        rationale: 'dashboard',
        owner: lab.tenantId,
        requestedAt: new Date().toISOString(),
        tags: ['dashboard'],
      },
      plans: lab.plans,
      windows: lab.windows,
      metadata: {},
      revision: 0,
    } as any));
    const summary = summarizeStore(envelopes, snapshot.runs);
    const analytics = computeAnalytics(envelopes, snapshot.runs);
    return {
      totalRuns: summary.totalRuns,
      topTenant: analytics.topTenant,
      latestRunAt: analytics.latestRunAt,
      criticalPlanCoverage: analytics.criticalPlanCoverage,
    };
  }
}
