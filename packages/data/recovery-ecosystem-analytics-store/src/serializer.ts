import { z } from 'zod';
import type { JsonValue } from '@shared/type-level';
import { type AnalyticsStoreSignalEvent, type AnalyticsStoreRunRecord } from './store-contract';

const analyticPayloadSchema = z
  .unknown()
  .transform((value: unknown): JsonValue => value as JsonValue);

const runRecordSchema = z.object({
  runId: z.string(),
  tenant: z.string(),
  namespace: z.string(),
  window: z.string(),
  session: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['draft', 'active', 'complete', 'error']),
  stages: z.array(
    z.object({
      stage: z.string(),
      startedAt: z.string(),
      completedAt: z.string().optional(),
      status: z.enum(['idle', 'running', 'done', 'failed']),
      diagnostics: z.array(z.string()),
    }),
  ),
  metadata: z.record(z.unknown()),
});

export const parseRunRecord = (input: unknown): AnalyticsStoreRunRecord => {
  const parsed = runRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`invalid run record: ${parsed.error.message}`);
  }
  return {
    ...parsed.data,
    runId: parsed.data.runId as AnalyticsStoreRunRecord['runId'],
    tenant: parsed.data.tenant as AnalyticsStoreRunRecord['tenant'],
    namespace: parsed.data.namespace as AnalyticsStoreRunRecord['namespace'],
    window: parsed.data.window as AnalyticsStoreRunRecord['window'],
    session: parsed.data.session as AnalyticsStoreRunRecord['session'],
    stages: parsed.data.stages.map((stage: {
      readonly stage: string;
      readonly startedAt: string;
      readonly completedAt?: string;
      readonly status: 'idle' | 'running' | 'done' | 'failed';
      readonly diagnostics: readonly string[];
    }) => ({
      stage: stage.stage as `stage:${string}`,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      status: stage.status,
      diagnostics: stage.diagnostics,
    })),
    metadata: parsed.data.metadata as Record<string, JsonValue>,
  };
};

export const stringifyRunRecord = (record: AnalyticsStoreRunRecord): string => JSON.stringify(record);

export const parseSignalEvent = (input: unknown): AnalyticsStoreSignalEvent => {
  if (typeof input !== 'object' || input === null) {
    throw new Error('event must be an object');
  }
  const value = input as Record<string, unknown>;
  const payload = analyticPayloadSchema.parse(value.payload);
  return {
    id: value.id as `event:${number}`,
    kind: value.kind as `signal:${string}`,
    runId: value.runId as `run:${string}`,
    session: value.session as AnalyticsStoreSignalEvent['session'],
    tenant: value.tenant as AnalyticsStoreSignalEvent['tenant'],
    namespace: value.namespace as AnalyticsStoreSignalEvent['namespace'],
    window: value.window as AnalyticsStoreSignalEvent['window'],
    payload,
    at: typeof value.at === 'string' ? value.at : new Date().toISOString(),
  };
};
