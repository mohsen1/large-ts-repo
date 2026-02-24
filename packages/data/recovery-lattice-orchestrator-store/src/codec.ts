import { z } from 'zod';
import { withBrand } from '@shared/core';
import { asRouteId, asRunId, type LatticeRouteId } from '@domain/recovery-lattice';
import { type LatticeSnapshotRecord, type LatticeStoreId } from './types';

const metricSchema = z.record(z.string(), z.unknown());

const eventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  at: z.string().min(1),
  kind: z.union([z.literal('snapshot'), z.literal('artifact'), z.literal('plan'), z.literal('error')]),
  payload: metricSchema,
});

const snapshotSchema = z.object({
  id: z.string().min(1),
  routeId: z.string().min(1),
  tenantId: z.string().min(1),
  context: z.object({
    tenantId: z.string().min(1),
    regionId: z.string().min(1),
    zoneId: z.string().min(1),
    requestId: z.string().min(1),
  }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  tags: z.array(z.string()),
  payload: metricSchema,
  events: z.array(eventSchema),
});

const optionSchema = z.object({
  namespace: z.string().min(1),
  maxEventsPerRecord: z.number().int().min(1).max(10_000),
  maxRecordsPerTenant: z.number().int().min(1).max(5000),
});

const hydrateEvent = (event: z.infer<typeof eventSchema>): LatticeSnapshotRecord['events'][number] => ({
  ...event,
  id: withBrand(event.id, 'lattice-store-event'),
  runId: asRunId(event.runId),
  tenantId: asTenantId(event.tenantId),
});

const asTenantId = (value: string) => withBrand(value, 'lattice-tenant:id');

export const encodeEvent = (payload: LatticeSnapshotRecord['events'][number]): string => JSON.stringify(payload);

export const decodeEvent = (raw: string): LatticeSnapshotRecord['events'][number] => {
  return hydrateEvent(eventSchema.parse(JSON.parse(raw)));
};

export const encodeSnapshot = (snapshot: LatticeSnapshotRecord): string => JSON.stringify(snapshot);

export const decodeSnapshot = (raw: string): LatticeSnapshotRecord => {
  const parsed = snapshotSchema.parse(JSON.parse(raw));
  return {
    ...parsed,
    id: withBrand(parsed.id, 'lattice-store-id') as LatticeStoreId,
    routeId: asRouteId(`route:${parsed.routeId}`) as LatticeRouteId,
    tenantId: asTenantId(parsed.tenantId),
    context: {
      tenantId: asTenantId(parsed.context.tenantId),
      regionId: withBrand(parsed.context.regionId, 'lattice-region:id'),
      zoneId: withBrand(parsed.context.zoneId, 'lattice-zone:id'),
      requestId: withBrand(parsed.context.requestId, 'lattice-trace-id'),
    },
    events: parsed.events.map(hydrateEvent),
    payload: parsed.payload,
  };
};

export const validateOptions = (options: unknown): { namespace: string; maxEventsPerRecord: number; maxRecordsPerTenant: number } => {
  return optionSchema.parse(options);
};

export const parseSnapshots = (payload: readonly string[]): LatticeSnapshotRecord[] => {
  return payload.map((raw) => decodeSnapshot(raw));
};

export const stringifySnapshots = (snapshots: readonly LatticeSnapshotRecord[]): string[] => {
  return snapshots.map((snapshot) => JSON.stringify(snapshot));
};

export const normalizeNamespace = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '-');
