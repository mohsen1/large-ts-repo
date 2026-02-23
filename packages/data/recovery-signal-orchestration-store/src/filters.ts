import type { CampaignRecord } from './records';
import type { CampaignState } from '@domain/recovery-signal-orchestration-models';

export interface CampaignFilter {
  readonly tenantId?: string;
  readonly facilityId?: string;
  readonly state?: CampaignState;
  readonly minSignalCount?: number;
  readonly maxSignalCount?: number;
}

const inRange = (count: number, min?: number, max?: number): boolean => {
  if (min !== undefined && count < min) {
    return false;
  }
  if (max !== undefined && count > max) {
    return false;
  }
  return true;
};

export const matchCampaign = (record: CampaignRecord, filter: CampaignFilter): boolean => {
  if (filter.tenantId && record.envelope.tenantId !== filter.tenantId) {
    return false;
  }

  if (filter.facilityId && record.envelope.facilityId !== filter.facilityId) {
    return false;
  }

  if (filter.state && record.run.state !== filter.state) {
    return false;
  }

  if (!inRange(record.plan.signals.length, filter.minSignalCount, filter.maxSignalCount)) {
    return false;
  }

  return true;
};
