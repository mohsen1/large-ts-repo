import {
  asNamespace,
  asPlan,
  asRun,
  asTenant,
  asWindow,
  type AnalyticsPlanRecord,
  type PipelineStep,
  type AnalyticsWindow,
  type AnalyticsTenant,
  type SignalNamespace,
} from '@domain/recovery-ecosystem-analytics';
import { type Brand, type JsonValue, type NoInfer } from '@shared/type-level';

export type PlanCatalogId = Brand<`catalog:${string}`, 'PlanCatalogId'>;
export type CatalogTenant = AnalyticsTenant;
export type CatalogNamespace = SignalNamespace;
export type CatalogWindow = AnalyticsWindow;
export type CatalogPlanStatus = 'seed' | 'active' | 'archived' | 'invalid';
export type CatalogPlanTag = `tag:${string}`;
export type CatalogLabel = `label:${string}`;
export type CatalogFingerprint = Brand<`fingerprint:${string}`, 'CatalogFingerprint'>;
export type CatalogSlotId = Brand<`slot:${string}`, 'CatalogSlot'>;

type AsConst<T> = Readonly<T>;
type Path<TPath extends readonly string[]> = TPath extends readonly [
  infer THead extends string,
  ...infer TRest extends readonly string[],
]
  ? readonly [`segment:${THead}`, ...Path<TRest>]
  : readonly [];

type ReversePath<TPath extends readonly unknown[]> = TPath extends readonly [infer THead, ...infer TRest]
  ? [...ReversePath<TRest & readonly unknown[]>, THead]
  : readonly [];

type CatalogRouteSeed<TParts extends readonly string[]> = TParts['length'] extends 0
  ? 'route:empty'
  : `${TParts[number]}::${TParts['length']}`;

export type PlanSignalTuple<T extends readonly string[]> = Path<T>;
export type ReversePlanSignalTuple<T extends readonly string[]> = AsConst<ReversePath<T> & readonly string[]>;
export type CatalogRouteSignature<TParts extends readonly string[] = readonly string[]> = CatalogRouteSeed<TParts>;

export interface CatalogStepDescriptor<TName extends string = string> {
  readonly key: `segment:${string}`;
  readonly name: TName;
  readonly label: `phase:${string}`;
}

export interface PlanCatalogTopology {
  readonly bySegment: Record<string, CatalogStepDescriptor>;
  readonly ordered: readonly CatalogStepDescriptor[];
}

export interface PlanCatalogSlot {
  readonly id: CatalogSlotId;
  readonly at: string;
  readonly active: boolean;
}

export interface CatalogMatchEvent {
  readonly kind: `signal:${string}`;
  readonly at: string;
  readonly score: number;
  readonly value: JsonValue;
}

export interface PlanCatalogRunRecord {
  readonly runId: ReturnType<typeof asRun>;
  readonly catalogId: PlanCatalogId;
  readonly tenant: CatalogTenant;
  readonly namespace: CatalogNamespace;
  readonly startedAt: string;
  readonly events: readonly CatalogMatchEvent[];
}

export interface CatalogQuery {
  readonly tenant?: CatalogTenant;
  readonly namespace?: CatalogNamespace;
  readonly status?: CatalogPlanStatus | readonly CatalogPlanStatus[];
  readonly window?: CatalogWindow;
  readonly labels?: readonly CatalogLabel[];
}

export interface PlanCatalogRecord {
  readonly catalogId: PlanCatalogId;
  readonly planId: AnalyticsPlanRecord['planId'];
  readonly plan: AnalyticsPlanRecord;
  readonly tenant: CatalogTenant;
  readonly namespace: CatalogNamespace;
  readonly window: CatalogWindow;
  readonly status: CatalogPlanStatus;
  readonly routeSignature: CatalogRouteSignature<readonly string[]>;
  readonly topology: PlanCatalogTopology;
  readonly tags: readonly CatalogPlanTag[];
  readonly labels: readonly CatalogLabel[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: CatalogFingerprint;
}

export interface PlanCatalogEnvelope<TPlan extends PlanCatalogRecord = PlanCatalogRecord> {
  readonly id: PlanCatalogId;
  readonly record: TPlan;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export type PlanCatalogRecordMap<TRecords extends readonly PlanCatalogRecord[]> = {
  [K in TRecords[number] as K['catalogId']]: K;
};

export const buildCatalogSlot = (seed: string): PlanCatalogSlot => ({
  id: `slot:${seed}` as CatalogSlotId,
  at: new Date().toISOString(),
  active: true,
});

const resolvePlanKind = (_signal: string): PipelineStep['kind'] => {
  const catalog = ['ingest', 'normalize', 'evaluate', 'aggregate', 'resolve'];
  return catalog[_signal.length % catalog.length] as PipelineStep['kind'];
};

export const buildCatalogTopology = <const TSignals extends readonly PipelineStep[]>(
  steps: NoInfer<TSignals>,
): PlanCatalogTopology => {
  const ordered = steps.toSorted((left, right) => left.name.localeCompare(right.name));
  const bySegment = ordered.reduce<Record<string, CatalogStepDescriptor>>((acc, entry) => {
    const key = `segment:${entry.id}`;
    acc[key] = {
      key: `segment:${entry.id}` as `segment:${string}`,
      name: entry.name,
      label: `phase:${entry.id}`,
    };
    return acc;
  }, {});
  return {
    bySegment,
    ordered: ordered.map((entry, index) => ({
      key: `segment:${index}`,
      name: entry.name,
      label: `phase:${entry.name}`,
    })),
  };
};

export const asCatalogId = (planId: string): PlanCatalogId => `catalog:${planId}` as PlanCatalogId;
export const asCatalogTenant = (tenant: string): CatalogTenant => asTenant(tenant);
export const asCatalogNamespace = (namespace: string): CatalogNamespace => asNamespace(namespace);
export const asCatalogWindow = (window: string): CatalogWindow => asWindow(window);

const asCatalogFingerprint = (seed: string, size: number): CatalogFingerprint =>
  `fingerprint:${seed}::${size}` as CatalogFingerprint;

const mapSignalSeeds = (signals: readonly string[]): readonly string[] =>
  signals.map((signal, index) => `${signal.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}-${index}`);

const buildPhases = (steps: readonly string[]) =>
  Object.fromEntries(
    steps.map((kind, index) => [
      `phase:${index}`,
      {
        name: kind,
        state: `state:${kind}`,
        input: { kind },
        output: { step: index },
      },
    ]),
  ) as AnalyticsPlanRecord['phases'];

const buildTopologyStep = <TSignal extends string>(
  signal: TSignal,
  index: number,
): PipelineStep<TSignal, unknown, JsonValue> => ({
  id: `stage:${index}-${signal}` as const,
  name: signal,
  kind: resolvePlanKind(signal),
  onStart: async (input: unknown): Promise<unknown> => input,
  transform: async (input: unknown): Promise<JsonValue> => ({ signal, input }) as JsonValue,
  onError: async (_error: unknown, event: unknown): Promise<unknown> => event,
});

export const catalogPlanFromPhases = <const TSignals extends readonly string[]>(
  tenant: string,
  namespace: string,
  signals: TSignals,
): AnalyticsPlanRecord => {
  const normalized = mapSignalSeeds(signals);
  const steps = normalized.map((signal, index) => buildTopologyStep(signal, index));
  return {
    planId: asPlan(`catalog-${tenant}-${namespace}-${normalized.length}`),
    tenant: asCatalogTenant(tenant),
    namespace: asCatalogNamespace(namespace),
    phases: buildPhases(normalized),
    steps,
    window: asCatalogWindow(`window:${tenant}:${namespace}`),
  };
};

export const buildCatalogTopologyLabel = <TSteps extends readonly PipelineStep[]>(steps: NoInfer<TSteps>) =>
  `route:${steps.map((entry) => entry.name).join('::') || 'empty'}` as CatalogRouteSignature<readonly string[]>;

export const buildCatalogCatalogRecord = (
  plan: AnalyticsPlanRecord,
  tenant: string,
  namespace: string,
  status: CatalogPlanStatus = 'seed',
): PlanCatalogRecord => {
  const route = buildCatalogTopologyLabel(plan.steps);
  const topology = buildCatalogTopology(plan.steps);
  return {
    catalogId: asCatalogId(plan.planId),
    planId: plan.planId,
    plan,
    tenant: asCatalogTenant(tenant),
    namespace: asCatalogNamespace(namespace),
    window: asCatalogWindow(plan.window),
    status: status === 'invalid' ? 'archived' : status,
    routeSignature: route,
    topology,
    tags: ['tag:catalog', `tag:${tenant}`, `tag:${namespace}`] as const,
    labels: ['label:runtime', `label:${plan.planId}`] as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fingerprint: asCatalogFingerprint(plan.planId, topology.ordered.length),
  };
};

export const catalogPlanFingerprint = (plan: AnalyticsPlanRecord, window = 0): CatalogFingerprint =>
  asCatalogFingerprint(plan.planId, window + plan.steps.length);

export const summarizeCatalogMatch = <const TKind extends string>(
  kind: TKind,
  at: string,
  score: number,
  value: JsonValue,
): CatalogMatchEvent => ({
  kind: `signal:${kind}` as `signal:${string}`,
  at,
  score,
  value,
});

export const buildCatalogMatchEvent = (seed: string): CatalogMatchEvent => ({
  kind: `signal:${seed}` as `signal:${string}`,
  at: new Date().toISOString(),
  score: seed.length,
  value: { seed },
});
