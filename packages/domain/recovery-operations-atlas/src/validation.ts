import { z } from 'zod';
import { RecoveryAtlasWindowId, RecoveryAtlasIncidentId } from './types';

const windowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  priority: z.number().min(0).max(100),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  windowId: z.string().min(1),
  component: z.string().min(1),
  region: z.string().min(2),
  environment: z.enum(['prod', 'stage', 'dr', 'canary']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  driftState: z.enum(['stable', 'degraded', 'disruptive', 'critical']),
  recoveredBySlaMinutes: z.number().nonnegative(),
  ownerTeam: z.string().min(1),
  resilienceTags: z.array(z.string()),
  tags: z.array(z.string()),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  dependencyWeight: z.number().min(0).max(1),
  requiredFor: z.array(z.string()),
  isHardDependency: z.boolean(),
  slaMinutes: z.number().positive(),
});

export const snapshotPayloadSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  incidentId: z.string().min(1),
  windows: z.array(windowSchema).nonempty(),
  graph: z.object({
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
  }),
});

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;

export const assertSnapshotPayload = (value: unknown): SnapshotPayload => snapshotPayloadSchema.parse(value);

export const coerceWindowId = (value: string): RecoveryAtlasWindowId => value as RecoveryAtlasWindowId;
export const coerceIncidentId = (value: string): RecoveryAtlasIncidentId => value as RecoveryAtlasIncidentId;

export const decodeSnapshotPayload = (value: string): SnapshotPayload => {
  const parsed = JSON.parse(value);
  return assertSnapshotPayload(parsed);
};
