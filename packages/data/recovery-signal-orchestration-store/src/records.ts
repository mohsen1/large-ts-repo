import type { CampaignEnvelope, CampaignPlan, CampaignRun, DispatchEnvelope } from '@domain/recovery-signal-orchestration-models';
import { Result, fail, ok } from '@shared/result';

export interface CampaignRecord {
  readonly envelope: CampaignEnvelope;
  readonly plan: CampaignPlan;
  readonly run: CampaignRun;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CampaignDispatchRecord {
  readonly envelope: CampaignEnvelope;
  readonly dispatch: DispatchEnvelope;
}

export class CampaignRecords {
  private readonly records = new Map<string, CampaignRecord>();
  private readonly dispatches = new Map<string, CampaignDispatchRecord[]>();

  upsertCampaign(record: CampaignRecord): Result<void, Error> {
    if (!record.envelope.bundleId) {
      return fail(new Error('bundleId is required'));
    }
    if (!record.plan.id || !record.run.id) {
      return fail(new Error('plan and run are required'));
    }
    if (record.plan.signals.length < record.plan.constraints.minSignals) {
      return fail(new Error('plan signal minimum violated'));
    }
    this.records.set(record.envelope.bundleId, record);
    return ok(undefined);
  }

  getCampaign(bundleId: string): Result<CampaignRecord, Error> {
    const record = this.records.get(bundleId);
    if (!record) {
      return fail(new Error(`missing campaign ${bundleId}`));
    }
    return ok(record);
  }

  appendDispatch(record: CampaignDispatchRecord): void {
    const timeline = this.dispatches.get(record.envelope.bundleId) ?? [];
    timeline.push(record);
    this.dispatches.set(record.envelope.bundleId, timeline);
  }

  listDispatches(bundleId: string): CampaignDispatchRecord[] {
    return this.dispatches.get(bundleId) ?? [];
  }

  listCampaigns(): CampaignRecord[] {
    return [...this.records.values()];
  }

  countByTenant(tenantId: string): number {
    return this.listCampaigns().filter((record) => record.envelope.tenantId === tenantId).length;
  }

  activeRunsByTenant(tenantId: string): CampaignRun[] {
    return this.listCampaigns()
      .filter((record) => record.envelope.tenantId === tenantId && record.run.state === 'active')
      .map((record) => record.run);
  }
}
