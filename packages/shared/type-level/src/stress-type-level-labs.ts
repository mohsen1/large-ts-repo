import type { NoInfer } from './patterns';

export type StressVerbFamily =
  | 'discover'
  | 'ingest'
  | 'materialize'
  | 'validate'
  | 'reconcile'
  | 'synthesize'
  | 'snapshot'
  | 'restore'
  | 'simulate'
  | 'inject'
  | 'amplify'
  | 'throttle'
  | 'rebalance'
  | 'reroute'
  | 'contain'
  | 'recover'
  | 'observe'
  | 'drill'
  | 'audit'
  | 'telemetry'
  | 'dispatch'
  | 'stabilize'
  | 'floodfill'
  | 'isolate'
  | 'mesh-check'
  | 'policy-rewrite'
  | 'policy-reset'
  | 'signal-triage'
  | 'workload-balance'
  | 'safety-guard'
  | 'latency-loop'
  | 'node-recover'
  | 'route-fallback'
  | 'topology-drift'
  | 'signal-reconcile'
  | 'policy-enforce'
  | 'load-shed'
  | 'audit-trace'
  | 'resource-scan'
  | 'state-rollback'
  | 'node-throttle'
  | 'policy-override'
  | 'mesh-evict'
  | 'workload-shape'
  | 'incident-close'
  | 'signal-stabilize'
  | 'timeline-drift'
  | 'resource-heal';

export type StressDomainFamily =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'autoscaler'
  | 'build'
  | 'cache'
  | 'cdn'
  | 'cluster'
  | 'connector'
  | 'container'
  | 'dashboard'
  | 'datastore'
  | 'device'
  | 'edge'
  | 'execution'
  | 'gateway'
  | 'identity'
  | 'incident'
  | 'integration'
  | 'k8s'
  | 'lifecycle'
  | 'load'
  | 'mesh'
  | 'node'
  | 'network'
  | 'observer'
  | 'orchestrator'
  | 'playbook'
  | 'policy'
  | 'planner'
  | 'queue'
  | 'recovery'
  | 'registry'
  | 'scheduler'
  | 'signal'
  | 'store'
  | 'telemetry'
  | 'workload'
  | 'pipeline';

export type StressSeverityFamily = 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info' | 'unknown';
export type StressIdFamily = `id-${number}` | `urn-${string}` | 'latest';

export type BuildTuple<
  TLength extends number,
  TAggregate extends readonly unknown[] = [],
> = TAggregate['length'] extends TLength
  ? TAggregate
  : BuildTuple<TLength, [...TAggregate, unknown]>;

export type DecrementN<T extends number> = BuildTuple<T> extends readonly [infer _Head, ...infer Tail] ? Tail['length'] : never;

export type NormalizeVerb<T extends string> = T extends `${infer Prefix}:${string}`
  ? Prefix extends string
    ? Prefix extends `re${infer Rest}`
      ? `re${Rest}`
      : Prefix
    : never
  : never;

export type StagePolicy<TVerb extends StressVerbFamily> = TVerb extends 'discover' | 'ingest' | 'materialize'
  ? 'bootstrap'
  : TVerb extends 'validate' | 'reconcile' | 'synthesize'
  ? 'control'
  : TVerb extends 'snapshot' | 'restore' | 'simulate' | 'inject'
  ? 'repair'
  : TVerb extends 'amplify' | 'throttle' | 'rebalance'
  ? 'stabilize'
  : TVerb extends 'reroute' | 'contain' | 'recover'
  ? 'containment'
  : TVerb extends 'observe' | 'drill' | 'audit'
  ? 'assurance'
  : TVerb extends 'telemetry' | 'dispatch'
  ? 'notify'
  : TVerb extends 'isolate' | 'floodfill' | 'policy-reset'
  ? 'hardening'
  : TVerb extends 'mesh-check' | 'resource-scan' | 'state-rollback'
  ? 'inspection'
  : TVerb extends 'workload-balance' | 'workload-shape'
  ? 'capacity'
  : 'default';

export type SeveritySignal<TSeverity extends StressSeverityFamily> = TSeverity extends 'emergency'
  ? 'fatal'
  : TSeverity extends 'critical'
    ? 'high'
    : TSeverity extends 'high'
      ? 'elevated'
      : TSeverity extends 'medium'
        ? 'medium'
        : TSeverity extends 'low'
          ? 'low'
          : 'unknown';

export type BranchByTemplate<T extends string> = T extends `${infer V}:${infer D}:${infer S}:${infer I}`
  ? V extends StressVerbFamily
    ? D extends StressDomainFamily
      ? S extends StressSeverityFamily
        ? I extends StressIdFamily
          ? {
              readonly verb: V;
              readonly domain: D;
              readonly severity: S;
              readonly id: I;
              readonly route: `/${V}/${D}/${S}/${I}`;
              readonly policy: StagePolicy<V>;
              readonly signal: SeveritySignal<S>;
            }
          : never
        : never
      : never
    : never
  : never;

export type ResolveStressCatalog<T extends readonly string[]> = {
  [Index in keyof T]: T[Index] extends `${string}:${string}:${string}:${string}`
    ? BranchByTemplate<T[Index] & string>
    : never;
};

export type ChainInput<T> = T extends `${infer V}:${infer _D}:${infer _S}:${infer _I}`
  ? V extends StressVerbFamily
    ? `/${V}/${string}`
    : never
  : never;

export type ChainByDepth<
  TVerb extends StressVerbFamily,
  TDepth extends number,
> = TDepth extends 0
  ? { readonly verb: TVerb; readonly next: never; readonly index: 0 }
  : {
      readonly verb: TVerb;
      readonly next: ChainByDepth<TVerb, DecrementN<TDepth>>;
      readonly index: TDepth;
      readonly route: ChainInput<`${TVerb}:agent:low:id-0`>;
    };

export type DeepDistributiveResolve<T extends readonly string[]> = T[number] extends infer TBranch
  ? TBranch extends string
    ? BranchByTemplate<TBranch> extends infer Resolved
      ? Resolved extends { readonly route: infer Route }
        ? {
            readonly branch: Resolved;
            readonly route: Route & string;
            readonly depth: BuildTuple<3>;
          }
        : never
      : never
    : never
  : never;

export type ChainAccumulator<T extends string, N extends number, Acc extends readonly string[] = readonly []> = N extends 0
  ? Acc
  : ChainAccumulator<T, DecrementN<N>, [...Acc, `${T}/${N}`]>;

export type ComposeChain<T extends string, N extends number> = ChainAccumulator<T, N> extends infer Chain
  ? Chain extends readonly string[]
    ? Chain[number]
    : never
  : never;

export type ParsedRoute<T extends string> = T extends `/${infer A}/${infer B}/${infer C}/${infer D}`
  ? { readonly a: A; readonly b: B; readonly c: C; readonly d: D }
  : { readonly a: never; readonly b: never; readonly c: never; readonly d: never };

export type RecomposeRoute<T extends string> = ParsedRoute<T> extends infer Parsed
  ? Parsed extends { readonly a: infer A; readonly b: infer B; readonly c: infer C; readonly d: infer D }
    ? `${A & string}:${B & string}:${C & string}:${D & string}`
    : never
  : never;

export type MatchRoute<T extends string> = T extends `${infer A}-${infer B}-${infer C}`
  ? {
      readonly left: A;
      readonly middle: B;
      readonly right: C;
      readonly normalized: `${Uppercase<A>}-${Uppercase<B>}-${Uppercase<C>}`;
    }
  : never;

export type ExpandProfile<T extends ReadonlyArray<string>> = {
  [Index in keyof T]: T[Index] extends `${infer V}:${infer D}:${infer S}:${infer I}`
    ? {
        readonly key: T[Index];
        readonly verb: V;
        readonly domain: D;
        readonly severity: S;
        readonly id: I;
        readonly route: `/${V}/${D}/${S}/${I}`;
      }
    : never;
};

export type FlattenUnion<T> = T extends any[] ? T[number] : T;

export type ChainProfile<T extends ReadonlyArray<string>> = ExpandProfile<T> & {
  readonly catalog: T;
  readonly tupleHead: T[0];
  readonly tail: T extends readonly [any, ...infer Rest] ? Rest : [];
};

export type RouteMap<T extends ReadonlyArray<string>> = {
  [K in keyof T as T[K] extends `${infer V}:${infer D}`
    ? `${Uppercase<V & string>}-${Uppercase<D & string>}`
    : never]: T[K];
};

type DomainRouteLookup<T extends ReadonlyArray<string>, TDomain extends StressDomainFamily> = RouteMap<T>[Extract<
  keyof RouteMap<T>,
  `${Uppercase<TDomain>}-${string}`
>];

export type TemplateMatrix<T extends ReadonlyArray<string>> = {
  [Domain in StressDomainFamily]: {
    readonly domain: Domain;
    readonly routes: DomainRouteLookup<T, Domain>;
  };
};

export type ProfiledRoute<T extends string> = T extends `${infer V}:${infer D}:${infer S}:${infer I}`
  ? {
      readonly raw: T;
      readonly parsed: BranchByTemplate<T>;
      readonly score: S extends 'critical' | 'emergency' ? 100 : 20;
      readonly chain: ComposeChain<V, 6>;
      readonly key: `${NoInfer<V>}:${NoInfer<D>}:${NoInfer<S>}:${NoInfer<I>}`;
    }
  : never;

export type ProfileUnion<T extends readonly string[]> = T[number] extends infer Entry
  ? Entry extends string
    ? ProfiledRoute<Entry>
    : never
  : never;

export const stressVerbFamilies = [
  'discover',
  'ingest',
  'materialize',
  'validate',
  'reconcile',
  'synthesize',
  'snapshot',
  'restore',
  'simulate',
  'inject',
  'amplify',
  'throttle',
  'rebalance',
  'reroute',
  'contain',
  'recover',
  'observe',
  'drill',
  'audit',
  'telemetry',
  'dispatch',
  'stabilize',
  'floodfill',
  'isolate',
  'mesh-check',
  'policy-rewrite',
  'signal-triage',
  'workload-balance',
  'safety-guard',
  'latency-loop',
  'node-recover',
  'route-fallback',
  'topology-drift',
  'signal-reconcile',
  'policy-enforce',
  'load-shed',
  'audit-trace',
  'policy-reset',
  'resource-scan',
  'state-rollback',
  'node-throttle',
  'policy-override',
  'mesh-evict',
  'workload-shape',
  'incident-close',
  'signal-stabilize',
  'timeline-drift',
  'resource-heal',
] as const satisfies ReadonlyArray<StressVerbFamily>;

export const stressDomainFamilies = [
  'agent',
  'artifact',
  'auth',
  'autoscaler',
  'build',
  'cache',
  'cdn',
  'cluster',
  'connector',
  'container',
  'dashboard',
  'datastore',
  'device',
  'edge',
  'execution',
  'gateway',
  'identity',
  'incident',
  'integration',
  'k8s',
  'lifecycle',
  'load',
  'mesh',
  'node',
  'network',
  'observer',
  'orchestrator',
  'playbook',
  'policy',
  'planner',
  'queue',
  'recovery',
  'registry',
  'scheduler',
  'signal',
  'store',
  'telemetry',
  'workload',
  'pipeline',
] as const satisfies ReadonlyArray<StressDomainFamily>;

export const buildCatalog = (verbs: readonly StressVerbFamily[] = stressVerbFamilies, domains: readonly StressDomainFamily[] = stressDomainFamilies) => {
  const severities = ['low', 'medium', 'high', 'critical', 'emergency', 'info', 'unknown'] as const;
  const catalog: string[] = [];

  for (let i = 0; i < verbs.length; i += 1) {
    const verb = verbs[i % verbs.length] as StressVerbFamily;
    const domain = domains[i % domains.length] as StressDomainFamily;
    const severity = severities[i % severities.length] as StressSeverityFamily;
    catalog.push(`${verb}:${domain}:${severity}:id-${i + 1}`);
  }

  return catalog as readonly string[];
};

export const stressCatalogTemplate = buildCatalog();
export type StressCatalogTemplate = typeof stressCatalogTemplate;
export type StressCatalogExpanded = ResolveStressCatalog<StressCatalogTemplate>;
export type StressCatalogProfiles = ProfileUnion<StressCatalogTemplate>;
export type StressCatalogRouteMap = RouteMap<StressCatalogTemplate>;

export const templateSignatureMap = Object.fromEntries(
  stressCatalogTemplate.map((value) => {
    const parsed = value.split(':');
    return [value, `${parsed[1]}:${parsed[0]}:${parsed[2]}`];
  }),
) as Record<string, string>;
