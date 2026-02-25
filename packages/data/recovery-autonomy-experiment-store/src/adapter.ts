import { z } from 'zod';
import { parseExperimentPlan, parseExperimentIntent } from '@domain/recovery-autonomy-experiment';
import { withBrand } from '@shared/core';
import { createRecordVersion, type ExperimentRecord } from './types';

const serializedSchema = z.object({
  version: z.number(),
  emittedAt: z.string(),
  record: z.object({
    recordId: z.string(),
    experimentId: z.string(),
    runId: z.string(),
    status: z.enum(['queued', 'active', 'completed', 'failed']),
    plan: z.unknown(),
    intent: z.unknown(),
    createdAt: z.string(),
    updatedAt: z.string(),
    version: z.number(),
  }),
});

const parseStatus = (status: string): 'queued' | 'active' | 'completed' | 'failed' => {
  if (status === 'active' || status === 'completed' || status === 'failed' || status === 'queued') {
    return status;
  }
  return 'queued';
};

export interface PersistedExperiment {
  readonly record: ExperimentRecord;
  readonly emittedAt: string;
}

export const encodeRecord = (record: ExperimentRecord): PersistedExperiment => ({
  record,
  emittedAt: new Date().toISOString(),
});

export const decodeRecord = (raw: unknown): PersistedExperiment => {
  const parsed = serializedSchema.parse(raw);
  return {
    emittedAt: parsed.emittedAt,
    record: {
      ...parsed.record,
      recordId: withBrand(parsed.record.recordId, 'ExperimentRecordId'),
      experimentId: parseExperimentPlan(parsed.record.plan).planId,
      runId: parseExperimentIntent(parsed.record.intent).runId,
      status: parseStatus(parsed.record.status),
      plan: parseExperimentPlan(parsed.record.plan),
      intent: parseExperimentIntent(parsed.record.intent),
      version: createRecordVersion(parsed.record.version),
    },
  };
};

export const toJson = (record: ExperimentRecord): string => JSON.stringify(encodeRecord(record));
export const fromJson = (payload: string): PersistedExperiment => decodeRecord(JSON.parse(payload));
