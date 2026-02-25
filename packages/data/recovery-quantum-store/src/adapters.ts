import { z } from 'zod';
import type { PersistedEnvelope, QuantumQueryFilter, QuantumRunRecord, QuantumStoreCursor } from './models';
import type { QuantumPlan, QuantumPolicy, QuantumRunbook, QuantumSignal, QuantumTenantId } from '@domain/recovery-quantum-orchestration';

export const runRecordSchema = z.object({
  id: z.string(),
  tenant: z.string(),
  name: z.string(),
  planId: z.string(),
  policyId: z.string(),
  signals: z.array(
    z.object({
      id: z.string(),
      tenant: z.string(),
      name: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      dimension: z.string(),
      score: z.number(),
      payload: z.record(z.string(), z.unknown()),
      observedAt: z.string(),
    }),
  ),
  policies: z.array(
    z.object({
      id: z.string(),
      tenant: z.string(),
      title: z.string(),
      weight: z.number(),
      scope: z.array(
        z.object({
          name: z.string(),
          tags: z.array(z.string()),
        }),
      ),
    }),
  ),
  plan: z.object({
    id: z.string(),
    tenant: z.string(),
    state: z.enum(['draft', 'staged', 'active', 'retired']),
    owner: z.string(),
    steps: z.array(
      z.object({
        id: z.string(),
        signalId: z.string(),
        command: z.string(),
        expectedLatencyMs: z.number(),
      }),
    ),
    labels: z.array(z.string()),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  metadata: z.object({
    severityOrder: z.record(z.string(), z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export interface StoreAdapterState {
  readonly runbooks: readonly QuantumRunbook[];
  readonly createdAt: string;
  readonly filters: readonly QuantumQueryFilter[];
}

export const toRecord = (runbook: QuantumRunbook): QuantumRunRecord =>
  ({
    id: `${runbook.id}:record`,
    tenant: runbook.tenant,
    name: runbook.name,
    planId: runbook.plans[0]?.id ?? `${runbook.tenant}:fallback`,
    policyId: runbook.policies[0]?.id ?? `${runbook.tenant}:policy`,
    signals: runbook.signals,
    policies: runbook.policies,
    plan: runbook.plans[0] ?? {
      id: `${runbook.tenant}:plan` as QuantumPlan['id'],
      tenant: runbook.tenant,
      state: 'draft',
      owner: 'adapter',
      steps: [],
      labels: ['seed'],
      metadata: { source: 'adapter' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    metadata: {
      severityOrder: {
        critical: 'critical',
        high: 'high',
        medium: 'medium',
        low: 'low',
        info: 'info',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  } as unknown) as QuantumRunRecord;

const buildPriority = (tenant: QuantumTenantId): `${'p'}-${number}` => {
  let checksum = 0;
  for (let index = 0; index < tenant.length; index += 1) {
    checksum = (checksum * 31 + tenant.charCodeAt(index)) % 10_000;
  }
  return `p-${checksum}` as `${'p'}-${number}`;
};

export const toRunbook = (record: QuantumRunRecord): QuantumRunbook => ({
  id: `${record.id}:runbook` as QuantumRunbook['id'],
  tenant: record.tenant,
  name: record.name,
  region: `${record.tenant}:region` as unknown as QuantumRunbook['region'],
  signals: record.signals,
  policies: record.policies,
  plans: [record.plan],
  metadata: {
    priority: buildPriority(record.tenant),
    zone: 'default',
    tags: ['adapted', record.id],
  },
});

export const decodePersisted = (input: unknown): QuantumRunRecord => {
  return runRecordSchema.parse(input) as unknown as QuantumRunRecord;
};

export const encodePersisted = (record: QuantumRunRecord): PersistedEnvelope<QuantumRunRecord> => ({
  schemaVersion: 'v1.0' as PersistedEnvelope<QuantumRunRecord>['schemaVersion'],
  payload: record,
});

export const matchTenant = (tenant: QuantumTenantId) => (runbook: QuantumRunbook): boolean => runbook.tenant === tenant;

export const cursorToArray = <T>(cursor: QuantumStoreCursor<T>): T => cursor.value;
