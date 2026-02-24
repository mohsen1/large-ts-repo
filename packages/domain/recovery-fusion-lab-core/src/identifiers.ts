import type { Brand } from '@shared/type-level';

export type LabEnvironment = 'production' | 'staging' | 'simulation' | 'chaos-lab';
export type LabReadinessBand = 0 | 1 | 2 | 3 | 4 | 5;
export type LabWavePhase = 'capture' | 'plan' | 'simulate' | 'execute' | 'observe';

export type BrandString<T, TBrand extends string> = Brand<T, TBrand>;
export type LabTenantId = BrandString<string, 'LabTenantId'>;
export type LabWorkspaceId = BrandString<string, 'LabWorkspaceId'>;
export type LabRunId = BrandString<string, 'LabRunId'>;
export type LabSignalId = BrandString<string, 'LabSignalId'>;
export type LabCommandId = BrandString<string, 'LabCommandId'>;
export type LabGraphNodeId = BrandString<string, 'LabGraphNodeId'>;
export type LabPluginId = BrandString<string, 'LabPluginId'>;
export type LabPolicyId = BrandString<string, 'LabPolicyId'>;
export type LabWaveId = BrandString<string, 'LabWaveId'>;

export type TenantNamespace = `tenant:${string}`;
export type WorkspaceNamespace = `workspace:${TenantNamespace}`;
export type DomainTag = `lab-tag:${string}`;
export type PhaseTag = `phase:${LabWavePhase}`;
export type MetricPath = `metric:${string}`;
export type EventRoute = `${TenantNamespace}/${WorkspaceNamespace}/${string}`;

export type NonEmptyString = string & { readonly __nonEmpty: unique symbol };
export type BrandOptional<T extends string, B extends string> = T extends '' ? never : BrandString<T, B>;

export type EnsureNonEmpty<T extends string> = T extends '' ? never : T;
export type Trimmed<T extends string> = T extends ` ${infer Tail}` | `${infer Tail} ` ? Trimmed<Tail> : T;

export const asLabTenantId = (tenant: EnsureNonEmpty<string>): LabTenantId =>
  tenant as LabTenantId;

export const asLabWorkspaceId = (tenant: TenantNamespace, suffix: string): LabWorkspaceId =>
  `${tenant}/workspace/${suffix}` as LabWorkspaceId;

export const asLabRunId = (workspaceId: LabWorkspaceId | string, stamp?: string): LabRunId =>
  (stamp === undefined ? (workspaceId as string) : `${workspaceId}#run:${stamp}`) as LabRunId;

export const asLabSignalId = (runId: LabRunId, source: string): LabSignalId =>
  `${runId}:signal:${source}` as LabSignalId;

export const asLabCommandId = (runId: LabRunId, step: string): LabCommandId =>
  `${runId}:command:${step}` as LabCommandId;

export const asLabNodeId = (runId: LabRunId, node: string): LabGraphNodeId =>
  `${runId}:node:${node}` as LabGraphNodeId;

export const asLabPluginId = (namespace: string, version: `${number}.${number}.${number}`): LabPluginId =>
  `${namespace}@${version}` as LabPluginId;

export const asLabWaveId = (runId: LabRunId | string, phase: LabWavePhase, index: number): LabWaveId =>
  `${runId}:wave:${phase}:${index}` as LabWaveId;

export const asLabPolicyId = (tenantId: string, policyKey: string): LabPolicyId =>
  `${tenantId}:policy:${policyKey}` as LabPolicyId;

export type SplitPath<T extends string, Acc extends readonly string[] = []> = T extends `${infer Head}.${infer Tail}`
  ? SplitPath<Tail, readonly [...Acc, Head]>
  : T extends ''
    ? Acc
    : readonly [...Acc, T];

export type JoinPath<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? Tail['length'] extends 0
        ? Head
        : `${Head}.${JoinPath<Tail>}`
      : never
    : never
  : '';

export type InferPathDepth<T extends string, N extends number = 0> = SplitPath<T> extends infer Parts extends readonly string[]
  ? Parts['length']
  : N;

export type RecursiveTuple<
  T,
  N extends number,
  Acc extends readonly T[] = [],
> = Acc['length'] extends N ? Acc : RecursiveTuple<T, N, readonly [...Acc, T]>;

export type PrefixTuple<T extends readonly string[]> = T extends readonly [infer H, ...infer Rest]
  ? H extends string
    ? Rest extends readonly string[]
      ? readonly [H, ...RecursiveTuple<H, Rest['length']>]
      : readonly [H]
    : readonly []
  : readonly [];

export type EventRouteParts<T extends EventRoute> = SplitPath<T, []>;

export interface LabIdentityContext {
  readonly tenant: TenantNamespace;
  readonly workspace: WorkspaceNamespace;
  readonly environment: LabEnvironment;
}

export interface LabEntityMetadata {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tenant: LabTenantId;
  readonly workspace: LabWorkspaceId;
  readonly tags: readonly DomainTag[];
}

export type BrandedMap<T> = {
  readonly [K in keyof T as K extends string ? `${K}` : never]: T[K];
};

export interface LabPathRecord<TPath extends string, TValue> {
  readonly path: TPath;
  readonly value: TValue;
  readonly labels: BrandedMap<{
    [K in TPath]: TValue;
  }>;
}

export const createLabIdentityContext = (
  tenant: TenantNamespace,
  workspace: WorkspaceNamespace,
  environment: LabEnvironment,
): LabIdentityContext => ({
  tenant,
  workspace,
  environment,
});

export const labRouteFor = (tenant: TenantNamespace, workspace: WorkspaceNamespace, suffix: string): EventRoute =>
  `${tenant}/${workspace}/${suffix}` as EventRoute;

export const labMetricKey = (path: MetricPath, signal: string): `${MetricPath}:${string}` => `${path}:${signal}`;
