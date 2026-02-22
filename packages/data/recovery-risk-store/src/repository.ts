import { fail, ok } from '@shared/result';
import type { Ok, Result } from '@shared/result';
import type { Envelope } from '@shared/protocol';
import type { RecoveryPolicy } from '@domain/recovery-policy';

import { parseRiskSignalFromEnvelope } from './adapters';
import type {
  RecoveryRiskProfileSnapshot,
  RiskHistoryPage,
  RiskPolicyBinding,
  RiskQuery,
  RiskSignalEnvelope,
  RiskSignalWithTrace,
} from './types';
import type { RiskProfileId, RiskRunId, RiskSignal } from '@domain/recovery-risk-models';

export interface RecoveryRiskRepository {
  saveSnapshot(snapshot: RecoveryRiskProfileSnapshot): Promise<boolean>;
  appendSignal(payload: Envelope<unknown>): Promise<Result<boolean, Error>>;
  findLatest(runId: RiskRunId, limit?: number): Promise<RecoveryRiskProfileSnapshot | undefined>;
  querySignals(query: RiskQuery): Promise<ReadonlyArray<RiskSignalWithTrace>>;
  bindPolicy(policy: RecoveryPolicy, enabled: boolean): Promise<RiskPolicyBinding>;
  listBindings(enabledOnly?: boolean): Promise<readonly RiskPolicyBinding[]>;
  listHistory(runId: RiskRunId): Promise<RiskHistoryPage>;
}

export class InMemoryRecoveryRiskRepository implements RecoveryRiskRepository {
  private readonly snapshots = new Map<RiskRunId, RecoveryRiskProfileSnapshot[]>();
  private readonly signals = new Map<string, RiskSignal>();
  private readonly bindings = new Map<string, RiskPolicyBinding>();

  async saveSnapshot(snapshot: RecoveryRiskProfileSnapshot): Promise<boolean> {
    const existing = this.snapshots.get(snapshot.runId) ?? [];
    this.snapshots.set(snapshot.runId, [...existing, snapshot]);
    return true;
  }

  async appendSignal(payload: Envelope<unknown>): Promise<Result<boolean, Error>> {
    const parsed = parseRiskSignalFromEnvelope(payload);
    if (!parsed.ok) return fail(parsed.error);
    this.signals.set(`${parsed.value.runId}:${parsed.value.id}`, parsed.value);
    return ok(true);
  }

  async findLatest(runId: RiskRunId): Promise<RecoveryRiskProfileSnapshot | undefined> {
    const entries = this.snapshots.get(runId) ?? [];
    return entries.at(-1);
  }

  async querySignals(query: RiskQuery): Promise<ReadonlyArray<RiskSignalWithTrace>> {
    const runIdMatches = (signal: RiskSignal): boolean => !query.runId || signal.runId === query.runId;
    const filtered = Array.from(this.signals.values()).filter(runIdMatches);
    const limit = Math.max(1, Math.min(300, query.limit ?? 100));
    return filtered.slice(0, limit).map((signal, index) => ({
      id: signal.id,
      runId: signal.runId,
      sequence: index + 1,
      signal,
    }));
  }

  async bindPolicy(policy: RecoveryPolicy, enabled: boolean): Promise<RiskPolicyBinding> {
    const bindingId = `${policy.id}:binding` as RiskPolicyBinding['bindingId'];
    const binding: RiskPolicyBinding = { bindingId, policy, enabled };
    this.bindings.set(bindingId, binding);
    return binding;
  }

  async listBindings(enabledOnly = false): Promise<readonly RiskPolicyBinding[]> {
    const entries = Array.from(this.bindings.values());
    return enabledOnly ? entries.filter((entry) => entry.enabled) : entries;
  }

  async listHistory(runId: RiskRunId): Promise<RiskHistoryPage> {
    const items = this.snapshots.get(runId) ?? [];
    return {
      items,
      total: items.length,
      hasMore: false,
      nextCursor: undefined,
    };
  }
}

export const asRiskSignalEnvelope = (signal: RiskSignal): RiskSignalEnvelope => ({
  signal,
  envelope: {
    id: `${signal.id}:env` as Envelope<RiskSignal>['id'],
    correlationId: `${Date.now()}` as Envelope<RiskSignal>['correlationId'],
    timestamp: new Date().toISOString(),
    eventType: 'recovery.risk.signal',
    payload: signal,
  },
});

