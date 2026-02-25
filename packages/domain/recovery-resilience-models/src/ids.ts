import { Brand, NoInfer, RecursivePath, DeepReadonly } from '@shared/type-level';
import type { MeshRunId, MeshRoute, MeshMeta, MeshZone } from '@shared/recovery-ops-runtime';

export type ZoneCode = 'zone-east' | 'zone-west' | 'zone-core';
export type SeverityTier = 'low' | 'elevated' | 'critical';
export type EventType = 'drift' | 'blast' | 'depletion' | 'throttle' | 'saga';

export type ResilienceStepId = Brand<string, 'resilience-step'>;
export type ScenarioId = Brand<string, 'scenario-id'>;
export type TelemetryStreamId = Brand<string, 'telemetry-stream'>;

export interface TenantContext {
  readonly tenantId: Brand<string, 'tenant-id'>;
  readonly zone: ZoneCode;
  readonly route: MeshRoute;
}

export interface TraceEnvelope {
  readonly runId: MeshRunId;
  readonly tenant: TenantContext;
  readonly meta: MeshMeta;
}

export interface ScenarioDescriptor<TPayload extends object = object> {
  readonly id: ScenarioId;
  readonly type: EventType;
  readonly confidence: number;
  readonly payload: TPayload;
  readonly severity: SeverityTier;
}

export type RoutePrefix<T extends string> = `${T}::${string}`;
export type BrandedRoute<T extends string> = T extends `${infer H}::${infer Rest}`
  ? H extends string
    ? Rest extends string
      ? `${H}/${Rest}` & RoutePrefix<H>
      : never
    : never
  : never;

export interface EventSnapshot<TShape extends object = object> {
  readonly scenario: ScenarioDescriptor<TShape>;
  readonly route: BrandedRoute<`resilience::${TShape extends { kind: string } ? TShape['kind'] : string}`>;
}

export type EventShape = {
  kind: EventType;
  scope: ZoneCode;
  tags: readonly string[];
  payload: Readonly<Record<string, unknown>>;
};

export type EventShapePaths = RecursivePath<EventShape>;

export type ScenarioInput<TContext extends object = object, TOverrides = never> = {
  readonly tenantId: Brand<string, 'tenant-id'>;
  readonly scenarioId: ScenarioId;
  readonly context: TContext;
} & (TOverrides extends never ? {} : { overrides: TOverrides });

export const makeTenantId = (seed: string): Brand<string, 'tenant-id'> => `${seed}-tenant` as Brand<string, 'tenant-id'>;
export const makeScenarioId = (seed: string): ScenarioId => `${seed}-scenario` as ScenarioId;

export const resolveSeverity = (score: number): SeverityTier => {
  if (score >= 0.9) {
    return 'critical';
  }
  if (score >= 0.6) {
    return 'elevated';
  }
  return 'low';
};

export const tenantAwareMeta = (tenantId: Brand<string, 'tenant-id'>, zone: ZoneCode): TenantContext => ({
  tenantId,
  zone,
  route: `${zone}.analysis` as MeshRoute,
});

export const bindTenant = <TValue extends object>(
  tenantId: Brand<string, 'tenant-id'>,
  data: TValue,
): ScenarioInput<TValue> => ({
  tenantId,
  scenarioId: makeScenarioId(tenantId as string),
  context: data,
} as ScenarioInput<TValue>);

export const mergeContext = <TContext extends object, TAdditional extends object>(
  context: TContext,
  additional: NoInfer<TAdditional>,
): DeepReadonly<TContext & TAdditional> => ({
  ...context,
  ...additional,
} as DeepReadonly<TContext & TAdditional>);
