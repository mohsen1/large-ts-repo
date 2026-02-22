import { z } from 'zod';
import { withBrand } from '@shared/core';
import type { SnapshotId, IntelligenceSnapshotKey, TimelinePoint } from './models';

const brandSnapshot: z.ZodType<SnapshotId, z.ZodTypeDef, string> =
  z.string().transform((value): SnapshotId => withBrand(value, 'OpsIntelligenceSnapshotId'));
const brandTimelinePoint: z.ZodType<TimelinePoint, z.ZodTypeDef, string> =
  z.string().transform((value): TimelinePoint => withBrand(value, 'TimelinePoint'));
const brandTenant = z.string().transform((value) => withBrand(value, 'TenantId'));

const signalRecordSchema = z.object({
  tenant: brandTenant,
  runId: z.string().min(1).transform((value): IntelligenceSnapshotKey['runId'] => withBrand(value, 'RecoveryRunId')),
  signalId: z.string().optional(),
  signal: z.unknown(),
  score: z.number(),
  consumedAt: z.string().datetime(),
});

export const snapshotIdSchema = brandSnapshot;
export const timelinePointSchema = brandTimelinePoint;
export const snapshotKeySchema: z.ZodType<
  IntelligenceSnapshotKey,
  z.ZodTypeDef,
  { tenant: string; runId: string }
> = z.object({
  tenant: brandTenant,
  runId: z.string().min(1).transform((value): IntelligenceSnapshotKey['runId'] => withBrand(value, 'RecoveryRunId')),
});

export const parseSignalRecord = (input: unknown) => signalRecordSchema.parse(input);
