import { Brand } from '@shared/type-level';

export type ScenarioId = Brand<string, 'ScenarioId'>;
export type ScenarioRunId = Brand<string, 'ScenarioRunId'>;
export type ScenarioStageId = Brand<string, 'ScenarioStageId'>;
export type ScenarioMetricKey = Brand<string, 'ScenarioMetricKey'>;

export const SCENARIO_NAMESPACE = '@recovery/scenario-design';

export type TimestampNanos = Brand<bigint, 'TimestampNanos'>;
export type EpochString = `${number}` & Brand<string, 'EpochString'>;

export type BrandedList<T, B extends string> = Brand<readonly T[], `list:${B}`>;
export type BrandOf<T, B extends string> = T & { readonly __brand: B };
export type ScenarioMarker<T extends string> = T & Brand<T, 'ScenarioMarker'>;

export type DeepLiteral<T> =
  T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends readonly [infer Head, ...infer Tail]
      ? [DeepLiteral<Head>, ...DeepLiteral<Tail>]
      : T extends ReadonlyArray<infer Item>
        ? readonly DeepLiteral<Item>[]
        : T extends object
          ? { readonly [K in keyof T]: DeepLiteral<T[K]> }
          : T;

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...FlattenTuple<Tail>]
  : readonly [];

export type SegmentTuple<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...SegmentTuple<Tail>]
  : readonly [T];

export type JoinPath<T extends readonly string[]> = T extends readonly [infer Head]
  ? Head & string
  : T extends readonly [infer Head, ...infer Rest]
    ? Head extends string
      ? Rest extends readonly string[]
        ? `${Head}/${JoinPath<Rest>}`
        : string
      : string
    : string;

export type PathFromTemplate<T extends string> = T extends `${infer Prefix}:{${infer Var}}${infer Tail}`
  ? `${Prefix}${Var}${PathFromTemplate<Tail>}`
  : T;

export type BrandedRoute<T extends string> = Brand<JoinPath<SegmentTuple<T>>, 'ScenarioRoute'>;

export function createScenarioId(scope: string, index: number): ScenarioId {
  return `${scope}/${String(index).padStart(12, '0')}` as ScenarioId;
}

export function createRunId(scope: string, clock: bigint): ScenarioRunId {
  return `${scope}-run-${clock}` as ScenarioRunId;
}

export function createStageId(name: string, index: number): ScenarioStageId {
  return `${name}::${index.toString(36)}` as ScenarioStageId;
}

export function brandMetricKey(namespace: string, name: string): ScenarioMetricKey {
  return `${namespace}:${name}` as ScenarioMetricKey;
}

export const canonicalScenarioNamespace = {
  namespace: SCENARIO_NAMESPACE,
  createdAt: Date.now(),
} satisfies {
  namespace: typeof SCENARIO_NAMESPACE;
  createdAt: number;
};

export type RouteParameter<T extends string> = T extends `${infer _Start}:${infer Name}`
  ? Name extends `${infer Segment}=${infer _Rest}`
    ? Segment
    : Name
  : never;

export type RouteParameters<T extends string> = T extends `${string}:${infer Rest}`
  ? Rest extends `${infer Param}&${infer Tail}`
    ? Param | RouteParameters<Tail>
    : Rest
  : never;

export type ScenarioEnvelope<T, TTag extends string = 'ScenarioEnvelope'> = BrandedList<T, TTag>;

export function parseRouteTemplate<const T extends string>(template: T): RouteParameters<T> {
  const tail = template.split(':')[1] ?? '';
  return (tail as RouteParameters<T>);
}

export function inferBrand<T extends string>(value: T): BrandOf<T, 'Inferred'> {
  return value as BrandOf<T, 'Inferred'>;
}

export type RoutePathFor<T extends string> = JoinPath<SegmentTuple<T>>;

export type StageAddress = `${ScenarioId}/${ScenarioStageId}`;

export function makeStageAddress(scenarioId: ScenarioId, stageId: ScenarioStageId): StageAddress {
  return `${scenarioId}/${stageId}`;
}

export function unwrapBrand<T>(value: Brand<T, string>): T {
  return value as T;
}

export type NodePath<T extends string> = T extends `${infer A}.${infer B}`
  ? { head: A; tail: NodePath<B> }
  : { head: T; tail: null };

export type RecursiveNodes<T extends string[]> = T extends readonly [infer H, ...infer R]
  ? H extends string
    ? [Brand<H, 'ScenarioNode'>, ...RecursiveNodes<R & string[]>]
    : []
  : [];

export type ScenarioNodePath = RecursiveNodes<['nodes', 'inputs', 'outputs', 'metrics']>;

export interface ScenarioIdentityMeta {
  readonly namespace: string;
  readonly canonical: typeof canonicalScenarioNamespace;
  readonly marker: ScenarioMarker<'identity'>;
}

export const identityMeta = {
  namespace: canonicalScenarioNamespace.namespace,
  marker: 'identity' as ScenarioMarker<'identity'>,
  canonical: canonicalScenarioNamespace,
} as const satisfies ScenarioIdentityMeta;
