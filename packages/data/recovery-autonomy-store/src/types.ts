import { z } from 'zod';
import { Brand, withBrand, type Edge } from '@shared/core';
import {
  AUTONOMY_SCOPE_SEQUENCE,
  type AutonomyGraph,
  type AutonomyRunId,
  type AutonomySignalEnvelope,
  type AutonomySignalInput,
  type AutonomyPlan,
  type AutonomyGraphId,
  type AutonomyScope,
} from '@domain/recovery-autonomy-graph';

export type AutonomyRunRecordId = Brand<string, 'AutonomyRunRecordId'>;
export type AutonomyStoreSlot = Brand<string, 'AutonomyStoreSlot'>;

export interface AutonomyStoreDefaults {
  readonly namespace: string;
  readonly compactBatch: number;
  readonly maxRecordsPerRun: number;
  readonly maxWindowMinutes: number;
}

export const AUTONOMY_STORE_LIMITS = {
  namespace: 'recovery-autonomy',
  compactBatch: 128,
  maxRecordsPerRun: 1_024,
  maxWindowMinutes: 24 * 60,
} as const satisfies AutonomyStoreDefaults;

const defaultsSchema = z.object({
  namespace: z.string().min(3),
  compactBatch: z.number().positive(),
  maxRecordsPerRun: z.number().positive(),
  maxWindowMinutes: z.number().positive(),
});

export interface AutonomyRunRecord {
  readonly recordId: AutonomyRunRecordId;
  readonly runId: AutonomyRunId;
  readonly graphId: AutonomyGraphId;
  readonly graph: AutonomyGraph;
  readonly slot: AutonomyStoreSlot;
  readonly stage: AutonomyScope;
  readonly signal: AutonomySignalEnvelope;
  readonly input: AutonomySignalInput;
  readonly createdAt: string;
}

export interface AutonomySignalWindow {
  readonly runId: AutonomyRunId;
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly records: readonly AutonomyRunRecord[];
}

export interface AutonomyStoreQuery {
  readonly tenantId?: string;
  readonly runId?: AutonomyRunId;
  readonly graphId?: AutonomyGraphId;
  readonly stage?: AutonomyScope;
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly limit?: number;
}

export interface AutonomyStorePage {
  readonly items: readonly AutonomyRunRecord[];
  readonly nextToken?: string;
  readonly hasMore: boolean;
  readonly total: number;
}

export interface RunReplayCursor {
  readonly stage: AutonomyScope;
  readonly position: number;
}

export interface RunRecordEnvelope {
  readonly runId: AutonomyRunId;
  readonly graphId: AutonomyGraphId;
  readonly plan: AutonomyPlan;
  readonly scope: AutonomyScope;
  readonly signal: AutonomySignalEnvelope;
  readonly input: AutonomySignalInput;
}

export const loadStoreDefaults = async (): Promise<AutonomyStoreDefaults> => {
  const response = {
    namespace: AUTONOMY_STORE_LIMITS.namespace,
    compactBatch: AUTONOMY_STORE_LIMITS.compactBatch,
    maxRecordsPerRun: AUTONOMY_STORE_LIMITS.maxRecordsPerRun,
    maxWindowMinutes: AUTONOMY_STORE_LIMITS.maxWindowMinutes,
  } satisfies AutonomyStoreDefaults;
  return defaultsSchema.parseAsync(response);
};

export const makeWindow = (runId: AutonomyRunId, records: readonly AutonomyRunRecord[]): AutonomySignalWindow => {
  const sorted = [...records].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    runId,
    windowStart: Number(first?.createdAt ?? Date.now()),
    windowEnd: Number(last?.createdAt ?? Date.now()),
    records: sorted,
  };
};

export const resolveScopes = (scopes?: readonly AutonomyScope[]): readonly AutonomyScope[] =>
  scopes && scopes.length ? scopes : [...AUTONOMY_SCOPE_SEQUENCE];

export const makeRecordId = (runId: AutonomyRunId, scope: AutonomyScope): AutonomyRunRecordId =>
  `${runId}:${scope}:${Date.now()}` as AutonomyRunRecordId;

export const makeSlot = (scope: AutonomyScope): AutonomyStoreSlot => withBrand(`slot:${scope}:${Date.now()}`, 'AutonomyStoreSlot');

export const parseAutonomyStoreDefaults = (payload: unknown): AutonomyStoreDefaults => defaultsSchema.parse(payload);

export type StageAuditTrail = {
  readonly edges: readonly Edge[];
  readonly stages: readonly AutonomyScope[];
  readonly namespace: string;
};
