import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';

export type LatticeEntityKind<K extends string> = Brand<string, `lattice-${K}:id`>;
export type LatticeTenantId = LatticeEntityKind<'tenant'>;
export type LatticeRegionId = LatticeEntityKind<'region'>;
export type LatticeZoneId = LatticeEntityKind<'zone'>;
export type LatticeStreamId = LatticeEntityKind<'stream'>;
export type LatticeRunId = LatticeEntityKind<'run'>;
export type LatticePluginId = LatticeEntityKind<'plugin'>;
export type LatticeRouteId = LatticeEntityKind<'route'>;
export type LatticeSnapshotId = LatticeEntityKind<'snapshot'>;
export type LatticeWindowId = Brand<string, 'lattice-window-id'>;
export type LatticeScope = `tenant:${LatticeTenantId}`;
export type LatticeTag<T extends string = string> = `tag:${Lowercase<T>}`;

export type BrandedTimestamp = Brand<string, 'lattice-timestamp'>;
export type BrandedTraceId = Brand<string, 'lattice-trace-id'>;

export interface LatticeContext {
  readonly tenantId: LatticeTenantId;
  readonly regionId: LatticeRegionId;
  readonly zoneId: LatticeZoneId;
  readonly requestId: BrandedTraceId;
  readonly [key: string]: unknown;
}

export const asTenantId = (value: string): LatticeTenantId => withBrand(value, 'lattice-tenant:id');
export const asRegionId = (value: string): LatticeRegionId => withBrand(value, 'lattice-region:id');
export const asZoneId = (value: string): LatticeZoneId => withBrand(value, 'lattice-zone:id');
export const asStreamId = (value: string): LatticeStreamId => withBrand(value, 'lattice-stream:id');
export const asRunId = (value: string): LatticeRunId => withBrand(value, 'lattice-run:id');
export const asPluginId = (value: string): LatticePluginId => withBrand(value, 'lattice-plugin:id');
export const asRouteId = (value: string): LatticeRouteId => withBrand(value.startsWith('route:') ? value : `route:${value}`, 'lattice-route:id');
export const asSnapshotId = (value: string): LatticeSnapshotId => withBrand(value, 'lattice-snapshot:id');
export const asWindowId = (value: string): LatticeWindowId => withBrand(value, 'lattice-window-id');

export const parseTenantScope = (value: string): LatticeContext => {
  const [tenant, region, zone, request] = value.split(':');
  return {
    tenantId: asTenantId(`tenant:${tenant ?? 'default'}`),
    regionId: asRegionId(`region:${region ?? 'global'}`),
    zoneId: asZoneId(`zone:${zone ?? 'primary'}`),
    requestId: withBrand(request ? `trace:${request}` : `trace:${Date.now().toString(36)}`, 'lattice-trace-id'),
  };
};

export type LatticeRouteParams<T extends string> = T extends `${infer A}/${infer B}`
  ? readonly [A, ...LatticeRouteParams<B>]
  : readonly [T];

export type PathJoin<T extends readonly string[]> = T extends readonly [infer H extends string, ...infer R extends readonly string[]]
  ? `${H}${R extends readonly [] ? '' : `/${PathJoin<R>}`}`
  : never;

export const path = <const T extends readonly string[]>(...parts: T): PathJoin<T> =>
  parts.join('/') as PathJoin<T>;

export const makeTraceId = (...parts: readonly string[]): BrandedTraceId => {
  const normalized = parts
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean);
  return withBrand(`trace:${normalized.join('::')}:${Date.now().toString(36)}`, 'lattice-trace-id');
};

export const makeRoute = <const T extends readonly string[]>(tenant: string, ...segments: T): `${LatticeRouteId}` => {
  const raw = path(tenant, ...segments);
  return asRouteId(raw) as `${LatticeRouteId}`;
};

export type BrandedRecordMap<T extends string> = {
  [K in T as `${K & string}:meta`]: string;
};

export type LatticeLabels<T extends string> = BrandedRecordMap<T>;

export const makeTimestamp = (): BrandedTimestamp => {
  return withBrand(new Date().toISOString(), 'lattice-timestamp');
};

export interface LabeledEntity {
  readonly tenant: LatticeTenantId;
  readonly region: LatticeRegionId;
  readonly tags: readonly LatticeTag<string>[];
}

export const withZoneLabel = <T extends string>(label: T, zone: LatticeZoneId): `${T}::${LatticeZoneId}` => {
  return `${label}::${zone}` as `${T}::${LatticeZoneId}`;
};
