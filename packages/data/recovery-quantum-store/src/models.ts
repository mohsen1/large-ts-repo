import {
  type QuantumPlan,
  type QuantumPolicy,
  type QuantumRunbook,
  type QuantumSignal,
  type QuantumSeverity,
  type QuantumTenantId,
} from '@domain/recovery-quantum-orchestration';
import type { Brand } from '@shared/type-level';

export type PersistedScalar = string | number | boolean | null;

export type PersistedValue = PersistedScalar | PersistedArray | { [k: string]: PersistedValue };

export interface PersistedArray extends Array<PersistedValue> {}

export interface QuantumRunRecord {
  readonly id: Brand<string, 'quantum-run-record'>;
  readonly tenant: QuantumTenantId;
  readonly name: string;
  readonly planId: string;
  readonly policyId: string;
  readonly signals: readonly QuantumSignal[];
  readonly policies: readonly QuantumPolicy[];
  readonly plan: QuantumPlan;
  readonly metadata: {
    readonly severityOrder: Record<string, QuantumSeverity>;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
}

export interface PersistedRunbook {
  readonly record: QuantumRunRecord;
  readonly checksum: Brand<string, 'quantum-checksum'>;
}

export interface QuantumQueryFilter {
  readonly tenant?: QuantumTenantId;
  readonly severity?: QuantumSeverity;
  readonly fromIso?: string;
  readonly toIso?: string;
}

export interface QuantumStoreCursor<T> {
  readonly index: number;
  readonly value: T;
  readonly done: boolean;
}

export interface QuantumQueryStats {
  readonly total: number;
  readonly matched: number;
  readonly skipped: number;
}

export const createChecksum = (run: QuantumRunRecord): Brand<string, 'quantum-checksum'> => {
  const source = `${run.id}:${run.tenant}:${run.planId}:${run.metadata.updatedAt}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 1_000_000_007;
  }
  return `ck-${hash}` as Brand<string, 'quantum-checksum'>;
};

export type PersistedEnvelope<TData> = {
  readonly schemaVersion: `v${number}.${number}`;
  readonly payload: TData;
};

export const asPersistedEnvelope = <T>(payload: T): PersistedEnvelope<T> => ({
  schemaVersion: 'v1.0' as `v${number}.${number}`,
  payload,
});
