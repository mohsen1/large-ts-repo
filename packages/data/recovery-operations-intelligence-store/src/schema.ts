import { z } from 'zod';
import { withBrand } from '@shared/core';
import type { SnapshotId, IntelligenceSnapshotKey, TimelinePoint } from './models';

const brandSnapshot = z.string().transform((value) => withBrand(value, 'OpsIntelligenceSnapshotId')) as z.ZodType<SnapshotId>;
const brandTimelinePoint = z.string().transform((value) => withBrand(value, 'TimelinePoint')) as z.ZodType<TimelinePoint>;
const brandTenant = z.string().transform((value) => withBrand(value, 'TenantId'));

const signalRecordSchema = z.object({
  tenant: brandTenant,
  runId: z.string().min(1),
  signalId: z.string().optional(),
  signal: z.unknown(),
  score: z.number(),
  consumedAt: z.string().datetime(),
});

export const snapshotIdSchema = brandSnapshot;
export const timelinePointSchema = brandTimelinePoint;
export const snapshotKeySchema = z.object({
  tenant: brandTenant,
  runId: z.string().min(1),
}) as z.ZodType<IntelligenceSnapshotKey>;

export const parseSignalRecord = (input: unknown) => signalRecordSchema.parse(input);
