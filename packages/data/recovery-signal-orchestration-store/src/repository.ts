import type {
  CampaignEnvelope,
  CampaignPlan,
  CampaignRun,
  CampaignState,
} from '@domain/recovery-signal-orchestration-models';
import { CampaignRecords } from './records';

export interface CampaignRepositoryState {
  readonly hasActiveRun: boolean;
  readonly totalCampaigns: number;
  readonly states: Record<CampaignState, number>;
}

const emptyState = (): Record<CampaignState, number> => ({
  queued: 0,
  active: 0,
  throttled: 0,
  completed: 0,
  cancelled: 0,
});

export class CampaignRepository {
  private readonly records = new CampaignRecords();
  private readonly history = new Map<string, CampaignRun[]>();

  saveCampaign(envelope: CampaignEnvelope, plan: CampaignPlan, run: CampaignRun): void {
    this.records.upsertCampaign({
      envelope,
      plan,
      run,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const runHistory = this.history.get(envelope.bundleId) ?? [];
    runHistory.push(run);
    this.history.set(envelope.bundleId, runHistory);
  }

  getRunHistory(bundleId: string): CampaignRun[] {
    return this.history.get(bundleId) ?? [];
  }

  allCampaigns(): CampaignEnvelope[] {
    return this.records.listCampaigns().map((record) => record.envelope);
  }

  stateSnapshot(): CampaignRepositoryState {
    const state = emptyState();
    let hasActiveRun = false;

    for (const record of this.records.listCampaigns()) {
      state[record.run.state] += 1;
      if (record.run.state === 'active') {
        hasActiveRun = true;
      }
    }

    return {
      hasActiveRun,
      totalCampaigns: this.records.listCampaigns().length,
      states: state,
    };
  }
}
