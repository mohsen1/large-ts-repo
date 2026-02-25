import { type Brand } from '@shared/type-level';

export type DomainId<T extends string> = Brand<string, T>;
export type ChaosSimNamespace = DomainId<'ChaosSimNamespace'>;
export type ChaosSimulationId = DomainId<'ChaosSimulationId'>;
export type ChaosScenarioId = DomainId<'ChaosScenarioId'>;
export type ChaosRunToken = DomainId<'ChaosRunToken'>;

export type BrandString<Prefix extends string, Value extends string> = `${Prefix}:${Value}`;
export type NamespaceChannel<T extends string = string> = BrandString<'namespace', Lowercase<T>>;
export type SimulationSlug<T extends string = string> = BrandString<'sim', Lowercase<T>>;
export type SignalKind = 'infra' | 'platform' | 'application' | 'workflow' | 'human';
export type SignalPriority = 0 | 1 | 2 | 3 | 4;

export type SignalKindRoute<T extends SignalKind = SignalKind> = `${T}::${Uppercase<T>}`;
export type SignalHeader<Key extends string = string> = `X-${Key}`;

export type ISO8601 = Brand<string, 'ISO8601'>;
export type UnixEpochMs = Brand<number, 'UnixEpochMs'>;
export type Percentile = Brand<number, 'Percentile'>;

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail
]
  ? readonly [Head, ...RecursiveTuple<Tail>]
  : readonly [];

export type VariadicTupleUnion<
  THead extends string,
  TTail extends readonly string[]
> = readonly [THead, ...TTail];

export interface SimDomainBase {
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly scenarioId: ChaosScenarioId;
  readonly runToken: ChaosRunToken;
  readonly version: `${number}.${number}.${number}`;
}

export type NamespacePath<T extends ChaosSimNamespace = ChaosSimNamespace, S extends ChaosScenarioId = ChaosScenarioId> =
  `${T}/${S}`;

export type KeyOf<T> = keyof T & string;

export type RemapNamespace<TNamespace extends Record<string, unknown>> = {
  [K in Extract<keyof TNamespace, string> as NamespaceChannel<K>]: TNamespace[K];
};

export type MergeNames<TLeft extends string, TRight extends string> = `${TLeft}::${TRight}`;

export type SignalEnvelopeId<T extends SignalKind = SignalKind, Id extends string = string> = MergeNames<SignalKindRoute<T>, Id>;

export interface ChaosSimulationMarker {
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly scenarioId: ChaosScenarioId;
  readonly runToken: ChaosRunToken;
  readonly createdAt: UnixEpochMs;
}

export interface SignalEnvelope<TValue = unknown, TKind extends SignalKind = SignalKind> {
  readonly kind: SignalKindRoute<TKind>;
  readonly priority: SignalPriority;
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly scenarioId: ChaosScenarioId;
  readonly payload: TValue;
  readonly at: UnixEpochMs;
}

export interface SimulationTrace<TValue = unknown> {
  readonly traceId: ChaosRunToken;
  readonly namespace: ChaosSimNamespace;
  readonly values: readonly SignalEnvelope<TValue>[];
  readonly span: NamespacePath;
}

export type SignalPath<T extends string = string> = `/${Lowercase<T>}/signals`;

export function asNamespace<T extends string>(value: T): ChaosSimNamespace {
  return `${value}`.toLowerCase() as unknown as ChaosSimNamespace;
}

export function asSimulationId<T extends string>(value: T): ChaosSimulationId {
  return value as unknown as ChaosSimulationId;
}

export function asScenarioId<T extends string>(value: T): ChaosScenarioId {
  return value as unknown as ChaosScenarioId;
}

export function asRunToken<T extends string>(value: T): ChaosRunToken {
  return value as unknown as ChaosRunToken;
}

export function toIsoDate(date: Date | number | string): ISO8601 {
  return new Date(date).toISOString() as ISO8601;
}

export function toEpochMs(date: Date | number | string): UnixEpochMs {
  return new Date(date).getTime() as UnixEpochMs;
}

export function makeMarker<TNamespace extends string, TSimulation extends string, TScenario extends string>(
  namespace: TNamespace,
  simulationId: TSimulation,
  scenarioId: TScenario
): ChaosSimulationMarker {
  return {
    namespace: asNamespace(namespace),
    simulationId: asSimulationId(simulationId),
    scenarioId: asScenarioId(scenarioId),
    runToken: asRunToken(`${namespace}:${simulationId}:${scenarioId}`),
    createdAt: toEpochMs(Date.now())
  };
}

export const signalKindMatrix = {
  infra: 1,
  platform: 2,
  application: 3,
  workflow: 4,
  human: 5
} as const satisfies Record<SignalKind, number>;

export type AllowedKind = keyof typeof signalKindMatrix;

export function isKnownKind(candidate: string): candidate is SignalKind {
  return Object.hasOwn(signalKindMatrix, candidate);
}
