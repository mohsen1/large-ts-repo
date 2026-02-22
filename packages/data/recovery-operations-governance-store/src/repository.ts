import type { PolicyHistoryRecord, PolicyStoreFilter, GovernanceStoreSnapshot, GovernanceStoreTenant } from './models';

export interface RecoveryGovernanceRepository {
  upsertOutcome(outcome: PolicyHistoryRecord): Promise<void>;
  findHistory(filter: PolicyStoreFilter): Promise<readonly PolicyHistoryRecord[]>;
  loadSnapshot(tenant: GovernanceStoreTenant): Promise<GovernanceStoreSnapshot | undefined>;
}
