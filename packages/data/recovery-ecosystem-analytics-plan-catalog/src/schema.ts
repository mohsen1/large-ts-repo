import type { JsonValue } from '@shared/type-level';
import {
  type CatalogLabel,
  type CatalogPlanStatus,
  type CatalogFingerprint,
  type CatalogQuery,
  type PlanCatalogRecord,
  type PlanCatalogRunRecord,
  buildCatalogCatalogRecord,
  asCatalogId,
  asCatalogNamespace,
  asCatalogTenant,
  asCatalogWindow,
} from './contracts';
import type { AnalyticsPlanRecord } from '@domain/recovery-ecosystem-analytics';
import { asRun } from '@domain/recovery-ecosystem-analytics';

type RecordEnvelope = {
  readonly catalogId: string;
  readonly planId: string;
  readonly tenant: string;
  readonly namespace: string;
  readonly window: string;
  readonly status: string;
  readonly routeSignature: string;
  readonly tags: readonly unknown[];
  readonly labels: readonly unknown[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly topology: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const sanitizeStatus = (value: unknown): CatalogPlanStatus =>
  value === 'seed' || value === 'active' || value === 'archived' || value === 'invalid'
    ? value
    : 'seed';

const normalizeLabels = (values: readonly unknown[]): readonly CatalogLabel[] =>
  values
    .filter((entry): entry is string => typeof entry === 'string')
    .map((value) => `label:${value}` as const);

const buildManifestEntry = (entry: PlanCatalogRecord): string =>
  `${entry.catalogId}:${entry.fingerprint}:${entry.labels.length}`;

export const isCatalogRecord = (value: unknown): value is PlanCatalogRecord => {
  if (!isObject(value)) {
    return false;
  }
  const envelope = value as RecordEnvelope;
  return (
    typeof envelope.catalogId === 'string' &&
    typeof envelope.planId === 'string' &&
    typeof envelope.tenant === 'string' &&
    typeof envelope.namespace === 'string' &&
    typeof envelope.window === 'string' &&
    typeof envelope.status === 'string' &&
    typeof envelope.createdAt === 'string' &&
    typeof envelope.updatedAt === 'string' &&
    typeof envelope.fingerprint === 'string' &&
    sanitizeStatus(envelope.status) === envelope.status
  );
};

export const validateCatalogQuery = (value: unknown): CatalogQuery | undefined => {
  if (!isObject(value)) {
    return undefined;
  }
  const tenant = typeof value.tenant === 'string' ? asCatalogTenant(value.tenant) : undefined;
  const namespace = typeof value.namespace === 'string' ? asCatalogNamespace(value.namespace) : undefined;
  const window = typeof value.window === 'string' ? asCatalogWindow(value.window) : undefined;
  const status = Array.isArray(value.status)
    ? value.status.map((entry) => sanitizeStatus(entry))
    : typeof value.status === 'string'
      ? [sanitizeStatus(value.status)]
      : undefined;
  const labels = isStringArray(value.labels) ? normalizeLabels(value.labels) : [];
  return {
    tenant,
    namespace,
    window,
    status: status && status.length === 1 ? status[0] : status,
    labels,
  };
};

export const emitManifest = (records: readonly PlanCatalogRecord[]): string =>
  JSON.stringify(
    records.map((entry) => ({
      catalogId: entry.catalogId,
      planId: entry.planId,
      fingerprint: entry.fingerprint,
      emit: buildManifestEntry(entry),
    })),
    null,
    2,
  );

export const parseManifest = (raw: string): readonly PlanCatalogRecord[] => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isCatalogRecord);
  } catch {
    return [];
  }
};

const toRuntimeWindow = (seed: string): string => `window:${seed}`.replace(/[^a-z0-9._-]+/gi, '-');
const toRuntimeAt = (): string => new Date().toISOString();

export const toRuntimeEvent = (seed: string, value: JsonValue): PlanCatalogRunRecord => ({
  runId: asRun(seed),
  catalogId: asCatalogId(seed),
  tenant: asCatalogTenant(seed),
  namespace: asCatalogNamespace(seed),
  startedAt: toRuntimeAt(),
  events: [
    {
      kind: `signal:${seed}` as const,
      at: toRuntimeAt(),
      score: seed.length,
      value,
    },
  ],
});

export const buildCatalogPlanFingerprint = (records: readonly PlanCatalogRecord[]): CatalogFingerprint =>
  (`fingerprint:${records.length}:${records[0]?.planId ?? 'empty'}` as CatalogFingerprint);

export const buildCatalogTimeline = (signals: readonly string[]): readonly string[] =>
  signals.map((signal, index) => `segment:${index}:${signal}`);

export const catalogDiagnostics = (records: readonly PlanCatalogRecord[]): readonly string[] =>
  records.map((entry, index) => `${index}:${entry.catalogId}:${entry.labels.length}`);

export const resolveRecordFromPlan = (plan: AnalyticsPlanRecord): PlanCatalogRecord =>
  buildCatalogCatalogRecord(plan, plan.tenant, plan.namespace, 'active');

export const resolveCatalogWindow = (seed: string): ReturnType<typeof asCatalogWindow> =>
  asCatalogWindow(toRuntimeWindow(seed));

export const normalizeCatalogMetadata = <T extends Readonly<Record<string, JsonValue>>>(payload: T): string =>
  JSON.stringify(payload, Object.keys(payload).sort());
