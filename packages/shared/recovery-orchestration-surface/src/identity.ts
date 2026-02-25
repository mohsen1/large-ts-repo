import type { Brand } from '@shared/type-level';

const namespaceList = ['workspace', 'lane', 'plugin', 'signal', 'telemetry', 'runtime'] as const;

export type SurfaceNamespace = (typeof namespaceList)[number];
export type SurfaceIdToken<TNamespace extends SurfaceNamespace, TBody extends string = string> = Brand<
  `${TNamespace}:${TBody}`,
  `${TNamespace}Id`
>;

export type SurfaceWorkspaceId = SurfaceIdToken<'workspace'>;
export type SurfaceLaneId = SurfaceIdToken<'lane'>;
export type SurfacePluginId = SurfaceIdToken<'plugin'>;
export type SurfaceSignalId = SurfaceIdToken<'signal'>;
export type SurfaceTelemetryId = SurfaceIdToken<'telemetry'>;

export type SurfaceNodeId = Brand<string, 'SurfaceNodeId'>;
export type SurfaceNodePath<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? Tail extends readonly []
    ? Head
    : `${Head}/${SurfaceNodePath<Tail>}`
  : never;

export type SurfaceNodeTuple = readonly [SurfaceNodeId, ...SurfaceNodeId[]];

type Decrement<TValue extends number> = TValue extends 0
  ? 0
  : TValue extends 1
    ? 0
    : TValue extends 2
      ? 1
      : TValue extends 3
        ? 2
        : TValue extends 4
          ? 3
          : 4;

export type PathSegmentRecursion<
  TParts extends readonly string[],
  TDepth extends number = 4,
> = TParts extends readonly [infer Head extends string, ...infer Rest extends readonly string[]]
  ? TDepth extends 0
    ? `${Head}...`
    : `${Head}/${PathSegmentRecursion<Rest, Decrement<TDepth>>}`
  : '';

export type SplitSurfacePath<TValue extends string> = TValue extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...SplitSurfacePath<Tail>]
  : readonly [TValue];

export interface SurfaceMetadata {
  readonly tenant: string;
  readonly domain: string;
  readonly namespace: SurfaceNamespace;
  readonly region?: string;
  readonly createdAt: number;
  readonly createdBy: string;
}

export type SurfaceRuntimeState = {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly stage: 'bootstrap' | 'runtime' | 'saturated' | 'recovered' | 'standby';
  readonly stageClock: string;
  readonly activePluginIds: readonly SurfacePluginId[];
  readonly nextTickAt: number;
  readonly tags: readonly string[];
  readonly signalWindowMs: number;
};

export interface SurfaceRuntimeContext {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly lane: SurfaceLaneId;
  readonly stage: SurfaceRuntimeState['stage'];
  readonly metadata: SurfaceMetadata;
  readonly createdAt: number;
}

export const workspaceNamespaces = {
  runtime: 'surface:runtime',
  lab: 'surface:lab',
  control: 'surface:control',
} as const satisfies Record<'runtime' | 'lab' | 'control', string>;

export const isSurfaceWorkspaceId = (value: string): value is SurfaceWorkspaceId => value.startsWith('workspace:');
export const isSurfacePluginId = (value: string): value is SurfacePluginId => value.startsWith('plugin:');

export const createSurfaceWorkspaceId = (region: string, tenant: string): SurfaceWorkspaceId =>
  `workspace:${region}-${tenant}` as SurfaceWorkspaceId;
export const createSurfaceLaneId = (workspaceId: SurfaceWorkspaceId, name: string): SurfaceLaneId =>
  `lane:${workspaceId}:${name}` as SurfaceLaneId;
export const createSurfaceNodeId = (workspaceId: SurfaceWorkspaceId, suffix: string | number): SurfaceNodeId =>
  `${workspaceId}:node:${suffix}` as SurfaceNodeId;
export const createSurfacePluginId = (laneId: SurfaceLaneId, pluginName: string): SurfacePluginId =>
  `plugin:${laneId}:${pluginName}` as SurfacePluginId;
export const createSurfaceSignalId = (workspaceId: SurfaceWorkspaceId, signal: string): SurfaceSignalId =>
  `signal:${workspaceId}:${signal}` as SurfaceSignalId;
export const createSurfaceTelemetryId = (workspaceId: SurfaceWorkspaceId, source: string): SurfaceTelemetryId =>
  `telemetry:${workspaceId}:${source}` as SurfaceTelemetryId;

export const namespaceGuards = {
  workspace: isSurfaceWorkspaceId,
  plugin: isSurfacePluginId,
} as const satisfies Record<'workspace' | 'plugin', (value: string) => boolean>;
