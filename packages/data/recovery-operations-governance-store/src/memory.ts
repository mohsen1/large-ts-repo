import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';
import type { RecoveryGovernanceRepository } from './repository';
import type { PolicyHistoryRecord, PolicyStoreFilter, GovernanceStoreSnapshot } from './models';
import { parsePolicyHistory, parseHistoryFilter } from './schema';

function applyTenantFilter(records: readonly PolicyHistoryRecord[], filter: PolicyStoreFilter): readonly PolicyHistoryRecord[] {
  return records.filter((record) => {
    if (filter.tenant && record.tenant !== filter.tenant) return false;
    if (filter.policyId && record.policyId !== filter.policyId) return false;
    if (typeof filter.blocked === 'boolean' && record.blocked !== filter.blocked) return false;
    if (filter.from && record.evaluatedAt < filter.from) return false;
    if (filter.to && record.evaluatedAt > filter.to) return false;
    return true;
  });
}

export class InMemoryRecoveryGovernanceRepository implements RecoveryGovernanceRepository {
  private readonly store = new Map<string, PolicyHistoryRecord[]>();

  async upsertOutcome(outcome: PolicyHistoryRecord): Promise<void> {
    const key = outcome.tenant;
    const list = this.store.get(key) ?? [];
    this.store.set(key, [...list, outcome]);
  }

  async findHistory(filter: PolicyStoreFilter): Promise<readonly PolicyHistoryRecord[]> {
    const parsed = parseHistoryFilter(filter);
    const all = Array.from(this.store.values()).flat();
    return applyTenantFilter(all, parsed);
  }

  async loadSnapshot(tenant: PolicyHistoryRecord['tenant']): Promise<GovernanceStoreSnapshot | undefined> {
    const entries = this.store.get(tenant) ?? [];
    if (!entries.length) return undefined;
    const last = entries[entries.length - 1];
    return {
      tenant,
      lastRunId: last.runId,
      records: [...entries].sort((a, b) => (a.evaluatedAt < b.evaluatedAt ? 1 : -1)),
    };
  }
}

export const safeParseHistory = (input: unknown): Result<readonly PolicyHistoryRecord[], string> => {
  try {
    if (!Array.isArray(input)) return fail('HISTORY_NOT_ARRAY');
    const parsed = input.map((entry) => parsePolicyHistory(entry));
    return ok(parsed);
  } catch {
    return fail('HISTORY_PARSE_FAILED');
  }
};
