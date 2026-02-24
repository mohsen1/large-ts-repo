import { createPluginSessionConfig } from './stress-studio-registry';
import {
  PluginExecutionRecord,
  PluginId,
  PluginKind,
  PluginResult,
  PluginDefinition,
  canonicalizeNamespace,
  type PluginEvent,
} from '@shared/stress-lab-runtime';
import { TenantId, RecoverySignal, WorkloadTarget, createTenantId } from './models';
import { type PluginManifestRecord } from './stress-studio-registry';

export interface PluginManifestEnvelope {
  readonly manifestVersion: `manifest-${number}`;
  readonly tenantId: TenantId;
  readonly source: string;
  readonly plugins: readonly PluginManifestRecord[];
  readonly createdAt: string;
  readonly tags: readonly string[];
}

export interface ManifestDigest {
  readonly tenantId: TenantId;
  readonly pluginCount: number;
  readonly requiredKinds: readonly PluginKind[];
  readonly checksum: string;
  readonly hasSignals: boolean;
}

export type PluginRecordTuple = readonly [PluginManifestRecord, ...PluginManifestRecord[]];

export type RecordByKind<K extends string, T extends readonly PluginManifestRecord[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends PluginManifestRecord
      ? Head['kind'] extends K
        ? [Head, ...RecordByKind<K, Extract<Tail, readonly PluginManifestRecord[]>>]
        : RecordByKind<K, Extract<Tail, readonly PluginManifestRecord[]>>
      : []
    : [];

const deriveChecksum = (records: readonly PluginManifestRecord[]): string => {
  return records
    .map((entry) => `${entry.id}:${entry.version}`)
    .sort()
    .join('|');
};

const sanitizeTags = (tags: readonly string[]): readonly string[] =>
  [...new Set(tags.map((tag) => tag.toLowerCase().replace(/\s+/g, '-')))];

export const parseManifest = (raw: string): PluginManifestEnvelope => {
  return JSON.parse(raw) as PluginManifestEnvelope;
};

export const buildManifestDigest = (envelope: PluginManifestEnvelope): ManifestDigest => {
  const requiredKinds = [...new Set(envelope.plugins.map((entry) => entry.kind))];
  return {
    tenantId: envelope.tenantId,
    pluginCount: envelope.plugins.length,
    requiredKinds,
    checksum: deriveChecksum(envelope.plugins),
    hasSignals: envelope.tags.includes('signals'),
  };
};

export const extractRecordTypes = <T extends readonly PluginManifestRecord[]>(records: T): PluginManifestRecord[] => {
  return [...records];
};

export const filterByKind = <T extends readonly PluginManifestRecord[], K extends string>(
  records: T,
  kind: K,
): RecordByKind<K, T> => {
  return records.filter((entry) => entry.kind === kind) as RecordByKind<K, T>;
};

export const pickLatestRecords = (records: readonly PluginManifestRecord[]): readonly PluginManifestRecord[] => {
  const latest = new Map<string, PluginManifestRecord>();
  for (const record of records) {
    const current = latest.get(record.id);
    if (!current || current.version < record.version) {
      latest.set(record.id, record);
    }
  }
  return [...latest.values()];
};

export const collectManifestEvents = (records: readonly PluginManifestRecord[]): readonly PluginEvent[] => {
  return records.map((record, index) => ({
    name: `stress-lab/${index % 2 === 0 ? 'input-validator' : 'runbook-optimizer'}:post:${record.id}` as PluginEvent['name'],
    pluginId: `${record.id}-event` as PluginId,
    at: new Date().toISOString(),
    metadata: {
      kind: record.kind,
      version: record.version,
      namespace: record.namespace,
    },
  }));
};

export const buildRuntimeEnvelope = <
  const TManifest extends PluginManifestRecord[],
>(
  tenantId: TenantId,
  payload: {
    readonly source: string;
    readonly plugins: TManifest;
    readonly tags: readonly string[];
  },
): PluginManifestEnvelope => {
  return {
    manifestVersion: `manifest-${tenantId.length % 1000}`,
    tenantId,
    source: payload.source,
    plugins: pickLatestRecords(payload.plugins),
    createdAt: new Date().toISOString(),
    tags: sanitizeTags(payload.tags),
  };
};

export const summarizeManifest = (envelope: PluginManifestEnvelope): string => {
  const digest = buildManifestDigest(envelope);
  return `tenant=${digest.tenantId} count=${digest.pluginCount} kinds=${digest.requiredKinds.join(',')}`;
};

export const toManifestEvents = (records: readonly PluginManifestRecord[]): PluginEvent[] => {
  const events: PluginEvent[] = [];
  for (const record of records) {
    const pluginId = `${record.id}` as PluginId;
    events.push({
      name: `stress-lab/manifest:pre:${record.namespace}` as PluginEvent['name'],
      pluginId,
      at: new Date().toISOString(),
      metadata: {
        kind: record.kind,
        tags: record.tags,
        id: record.id,
      },
    });
  }
  return events;
};

export const traceManifestPlugin = async (
  records: readonly PluginManifestRecord[],
  pluginDefs: readonly PluginDefinition<unknown, unknown>[],
): Promise<PluginResult<PluginExecutionRecord<unknown, unknown>[]>> => {
  const events = toManifestEvents(records);
  const eventMap = new Map<string, number>(
    events.map((event, index) => [JSON.stringify(event), index]),
  );

  return {
    ok: true,
    value: pluginDefs.map((plugin) => ({
      pluginId: plugin.id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      input: plugin.name,
      output: {
        ok: true,
        value: plugin,
        generatedAt: new Date().toISOString(),
      },
    })),
    generatedAt: new Date().toISOString(),
  };
};

export const collectPluginsByVersion = (records: readonly PluginManifestRecord[]): Readonly<Record<string, PluginManifestRecord[]>> => {
  const groups = new Map<string, PluginManifestRecord[]>();
  for (const record of records) {
    const group = groups.get(record.version) ?? [];
    group.push(record);
    groups.set(record.version, group);
  }
  return Object.fromEntries([...groups.entries()].map(([version, list]) => [version, list]));
};

export const createManifestFromRuntimeCatalog = async (): Promise<PluginManifestEnvelope> => {
  const config = createPluginSessionConfig(
    createTenantId('runtime:tenant:manifest'),
    canonicalizeNamespace('recovery:stress:lab'),
    `manifest-${Date.now()}`,
  );

  return buildRuntimeEnvelope(createTenantId('runtime:tenant:manifest'), {
    source: `${config.namespace}/catalog`,
    plugins: [],
    tags: ['manifest', config.requestId],
  });
};
