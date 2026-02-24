import {
  type IncidentIntentRecord,
  type IncidentIntentManifest,
  type IncidentIntentSignal,
  type IncidentTenantId,
  createIncidentTenantId,
} from '@domain/recovery-incident-intent';
import type { StoredIntentRecord } from './models';

export interface IntentWire {
  readonly id: string;
  readonly tenantId: IncidentTenantId;
  readonly manifest: IncidentIntentRecord;
  readonly signals?: readonly IncidentIntentSignal[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export const serializeRecord = (
  record: StoredIntentRecord,
  signals: readonly IncidentIntentSignal[] = [],
): IntentWire => ({
  id: record.id,
  tenantId: record.tenantId,
  manifest: record.manifest,
  signals,
  metadata: {
    createdAt: record.createdAt,
    version: record.version,
    routeLength: record.manifest.route?.steps.length ?? 0,
  },
});

export const deserializeRecord = (wire: IntentWire): StoredIntentRecord => {
  const metadata = wire.metadata ?? {};
  const createdAt = typeof metadata.createdAt === 'string' ? metadata.createdAt : new Date().toISOString();
  const version = typeof metadata.version === 'number' ? metadata.version : 1;

  return {
    id: wire.id,
    tenantId: createIncidentTenantId(wire.tenantId),
    createdAt,
    manifest: wire.manifest,
    version,
  };
};

export const normalizeManifest = (manifest: IncidentIntentRecord): IncidentIntentManifest => {
  return {
    ...manifest,
    context: {
      ...manifest.context,
      tags: [...manifest.context.tags],
    },
  };
};

export const wireShape = {
  version: 1,
  kind: 'recovery-intent-record',
} as const;
