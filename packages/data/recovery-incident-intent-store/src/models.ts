import type {
  IncidentIntentRecord,
  IncidentIntentPolicy,
  IncidentIntentSignal,
  IncidentIntentTuple,
  IncidentContext,
  IncidentIntentRoute,
  IncidentTenantId,
} from '@domain/recovery-incident-intent';

export type { IncidentTenantId };

export interface StoredIntentRecord {
  readonly id: string;
  readonly tenantId: IncidentTenantId;
  readonly createdAt: string;
  readonly manifest: IncidentIntentRecord;
  readonly version: number;
}

export interface StoredIntentSnapshot {
  readonly recordId: string;
  readonly runAt: string;
  readonly signalCount: number;
  readonly policyCount: number;
  readonly summary: string;
}

export interface StoredIntentQuery {
  readonly tenantId?: IncidentTenantId;
  readonly manifestIds?: readonly string[];
  readonly titleContains?: string;
  readonly since?: string;
}

export interface StoredIntentCommand {
  readonly tenantId: IncidentTenantId;
  readonly manifest: IncidentIntentRecord;
  readonly signals: readonly IncidentIntentSignal[];
  readonly policies: readonly IncidentIntentPolicy[];
  readonly context: IncidentContext;
}

export interface IntentStoreFilter {
  readonly tenantId: IncidentTenantId;
  readonly includeSignals?: boolean;
  readonly includePolicies?: boolean;
  readonly pageSize: number;
  readonly pageIndex: number;
}

export type IntentRecordTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...IntentRecordTuple<Rest>]
  : readonly [];

export const createStoredRecord = (input: Omit<StoredIntentRecord, 'id' | 'createdAt' | 'version'>): StoredIntentRecord => ({
  id: `${input.tenantId}:${input.manifest.catalogId}`,
  createdAt: new Date().toISOString(),
  version: 1,
  ...input,
});

export const toSnapshot = (record: StoredIntentRecord): StoredIntentSnapshot => {
  const routeLength = record.manifest.route?.steps.length ?? 0;
  return {
    recordId: record.id,
    runAt: record.createdAt,
    signalCount: routeLength + record.manifest.nodes.length,
    policyCount: record.manifest.context.tags.length,
    summary: `${record.manifest.title} (${record.manifest.tenantId})`,
  };
};

export const isStoredIntentRecord = (value: unknown): value is StoredIntentRecord => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredIntentRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    !!candidate.manifest &&
    typeof candidate.version === 'number'
  );
};

export const toSignalTuple = <T extends readonly IncidentIntentSignal[]>(
  signals: T,
): IncidentIntentTuple<T> => [...signals] as IncidentIntentTuple<T>;

export const mapPolicies = (policies: readonly IncidentIntentPolicy[]): Readonly<Record<string, IncidentIntentPolicy>> => {
  const output: Record<string, IncidentIntentPolicy> = {};
  for (const policy of policies) {
    output[policy.policyId as string] = policy;
  }
  return output;
};

export const queryKey = (query: StoredIntentQuery): string => {
  const safeTenant = query.tenantId ?? 'all';
  const safeLimit = query.manifestIds?.length ?? 0;
  const since = query.since ?? 'none';
  const title = query.titleContains ?? 'any';
  return `${safeTenant}:${safeLimit}:${title}:${since}`;
};

export type RouteSteps = IncidentIntentRoute['steps'];

export interface StoredRouteProjection {
  readonly routes: RouteSteps;
}

export const routeFromManifest = (manifest: IncidentIntentRecord): RouteSteps => manifest.route?.steps ?? [];
