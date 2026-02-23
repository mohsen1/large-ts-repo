import { Brand } from '@shared/type-level';

export type EntityId = Brand<string, 'EntityId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type RunId = Brand<string, 'RunId'>;
export type Region = Brand<string, 'Region'>;

export type UtcIsoTimestamp = Brand<string, 'UtcIsoTimestamp'>;
export type ServiceCode = Brand<string, 'ServiceCode'>;
export type Namespace = Brand<string, 'Namespace'>;

export type EntityRef<T extends string = string> = {
  id: EntityId;
  kind: T;
};

export type PlanLabel = {
  short: string;
  long: string;
  emoji: string;
  labels: ReadonlyArray<string>;
};

export type RegionTopology = {
  region: Region;
  namespace: Namespace;
  services: ServiceCode[];
  isPrimary: boolean;
};

export type AuditContext = {
  actor: EntityRef<'operator'>;
  source: string;
  requestId: RunId;
  correlationId: string;
};

export const formatEntityRef = (kind: string, id: string): EntityRef<string> => ({
  kind,
  id: id as EntityId,
});

export const encodeCompositeId = (parts: readonly [string, string, string]): PlanId => {
  const [region, namespace, name] = parts;
  return `${region}:${namespace}:${name}` as PlanId;
};

export type LabelSet = {
  criticality: 'low' | 'medium' | 'high' | 'critical';
  scope: 'platform' | 'service' | 'fleet';
  owner: string;
  labels: ReadonlyArray<string>;
};

export type DomainVersion = Brand<number, 'DomainVersion'>;

export interface Versioned {
  readonly version: DomainVersion;
  readonly effectiveAt: UtcIsoTimestamp;
}

export const nextEntityId = (seed: string): EntityId => `${seed}:${Math.random().toString(36).slice(2)}` as EntityId;
export const nextRunId = (seed: string): RunId => `run:${seed}:${Date.now()}` as RunId;
export const toTimestamp = (value: Date): UtcIsoTimestamp => value.toISOString() as UtcIsoTimestamp;
