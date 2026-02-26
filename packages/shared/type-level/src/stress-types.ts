import type { Brand } from './patterns';

export type StressVerb =
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
  | 'dispatch';

export type StressDomain =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'autoscaler'
  | 'build'
  | 'cache'
  | 'cdn'
  | 'cluster'
  | 'config'
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
  | 'nodepool'
  | 'observer'
  | 'orchestrator'
  | 'playbook'
  | 'policy'
  | 'pipeline'
  | 'planner'
  | 'queue'
  | 'recovery'
  | 'registry'
  | 'scheduler'
  | 'signal'
  | 'store'
  | 'telemetry'
  | 'workload';

export type StressSeverity = 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info';

export type StressCommand = `${StressVerb}:${StressDomain}:${StressSeverity}`;

type RoutePattern<T extends string = string> = `/recovery/${T}/${string}/${string}`;

type BuildTuple<
  Length extends number,
  Accumulator extends number[] = [],
> = Accumulator['length'] extends Length
  ? Accumulator
  : BuildTuple<Length, [...Accumulator, 0]>;

export type Decrement<N extends number> = BuildTuple<N> extends readonly [infer _Head, ...infer Tail]
  ? Tail['length']
  : 0;

export type ExtendTuple<TTuple extends unknown[], Value> = [...TTuple, Value];

export type WrapTuple<TValue, TDepth extends number> = TDepth extends 0
  ? readonly [TValue]
  : readonly [TValue, ...BuildTuple<TDepth>];

export type BuildRangeTuple<
  Min extends number,
  Max extends number,
  Current extends number[] = BuildTuple<Min>,
> = Current['length'] extends Max
  ? readonly [...Current]
  : BuildRangeTuple<Min, Max, [...Current, Current['length'] & number]>;

export type DeepNest<T, Depth extends number> = Depth extends 0
  ? T
  : {
      readonly depth: Depth;
      readonly payload: DeepNest<T, Decrement<Depth>>;
      readonly marker: `depth:${Depth}`;
    };

export type RecursiveTuple<T extends number> = T extends 0
  ? readonly []
  : readonly [number, ...RecursiveTuple<Decrement<T>>];

export type ResolveByVerb<TVerb extends StressVerb, TDomain extends StressDomain, TSeverity extends StressSeverity> =
  TVerb extends 'discover'
    ? { readonly category: 'discover'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'discovery' }
    : TVerb extends 'ingest'
      ? { readonly category: 'ingest'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'ingress' }
      : TVerb extends 'materialize'
        ? { readonly category: 'materialize'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'assembly' }
        : TVerb extends 'validate'
          ? { readonly category: 'validate'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'verification' }
          : TVerb extends 'reconcile'
            ? { readonly category: 'reconcile'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'repair' }
            : TVerb extends 'synthesize'
              ? { readonly category: 'synthesize'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'build' }
              : TVerb extends 'snapshot'
                ? { readonly category: 'snapshot'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'archive' }
                : TVerb extends 'restore'
                  ? { readonly category: 'restore'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'restore' }
                  : TVerb extends 'simulate'
                    ? { readonly category: 'simulate'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'dry-run' }
                    : TVerb extends 'inject'
                      ? { readonly category: 'inject'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'chaos' }
                      : TVerb extends 'amplify'
                        ? { readonly category: 'amplify'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'burst' }
                        : TVerb extends 'throttle'
                          ? { readonly category: 'throttle'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'protection' }
                          : TVerb extends 'rebalance'
                            ? { readonly category: 'rebalance'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'topology' }
                            : TVerb extends 'reroute'
                              ? {
                                  readonly category: 'reroute';
                                  readonly severity: TSeverity;
                                  readonly domain: TDomain;
                                  readonly stage: 'traffic';
                                }
                              : TVerb extends 'contain'
                                ? { readonly category: 'contain'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'isolation' }
                                : TVerb extends 'recover'
                                  ? { readonly category: 'recover'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'healing' }
                                  : TVerb extends 'observe'
                                    ? { readonly category: 'observe'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'monitor' }
                                    : TVerb extends 'drill'
                                      ? { readonly category: 'drill'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'practice' }
                                      : TVerb extends 'audit'
                                        ? { readonly category: 'audit'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'compliance' }
                                        : TVerb extends 'telemetry'
                                          ? {
                                              readonly category: 'telemetry';
                                              readonly severity: TSeverity;
                                              readonly domain: TDomain;
                                              readonly stage: 'signalization';
                                            }
                                          : { readonly category: 'dispatch'; readonly severity: TSeverity; readonly domain: TDomain; readonly stage: 'dispatch' };

export type ResolveCommand<T extends StressCommand> = T extends `${infer TVerb}:${infer TDomain}:${infer TSeverity}`
  ? TVerb extends StressVerb
    ? TDomain extends StressDomain
      ? TSeverity extends StressSeverity
        ? ResolveByVerb<TVerb, TDomain, TSeverity>
        : never
      : never
    : never
  : never;

export type CommandAccumulator<T extends StressCommand, Acc extends readonly unknown[] = []> = T extends never
  ? Acc
  : ResolveCommand<T> extends infer Resolved
    ? [Resolved, ...CommandAccumulator<Exclude<T, T>, Acc>]
    : Acc;

export type ResolveCommandSet<T extends readonly StressCommand[]> = {
  [Index in keyof T]: T[Index] extends StressCommand ? ResolveCommand<T[Index]> : never;
};

export type ChainedCommandInput<T extends string> = T extends `${infer A}:${infer B}:${infer C}`
  ? T extends `${A}:${B}:${C}`
    ? {
        readonly verb: A;
        readonly domain: B;
        readonly severity: C;
        readonly route: RoutePattern<`${A}:${B}`>;
      }
    : never
  : never;

export type RouteProjection<T extends string> = T extends `/${infer _Service}/${infer Entity}/${infer Id}`
  ? {
      readonly service: _Service;
      readonly entity: Entity;
      readonly id: Id;
      readonly parsed: `/${_Service}/${Entity}/${Id}`;
    }
  : never;

export type TemplateRoute<
  TEntities extends readonly string[],
  TVerb extends StressVerb,
> = TEntities[number] extends infer Entity
  ? Entity extends string
    ? `/${TVerb}/${Entity}/${string}`
    : never
  : never;

export type RouteCatalog<TEntities extends readonly string[]> = {
  readonly entities: TEntities[number];
  readonly routes: readonly TemplateRoute<TEntities, StressVerb>[];
};

export interface StressLayerA { readonly layerA: Brand<string, 'layerA'>; readonly active: true; }
export interface StressLayerB extends StressLayerA { readonly layerB: `layer:${number}`; readonly activeB: boolean; }
export interface StressLayerC extends StressLayerB { readonly layerC: number; readonly tagsC: readonly string[]; }
export interface StressLayerD extends StressLayerC { readonly layerD: Record<string, string>; readonly valueD: number; }
export interface StressLayerE extends StressLayerD { readonly layerE: readonly [string, ...string[]]; readonly flagE: true; }
export interface StressLayerF extends StressLayerE { readonly layerF: Map<string, string>; readonly valueF: number; }
export interface StressLayerG extends StressLayerF { readonly layerG: Set<string>; readonly valueG: Brand<number, 'G'>; }
export interface StressLayerH extends StressLayerG { readonly layerH: readonly number[]; readonly valueH: boolean; }
export interface StressLayerI extends StressLayerH { readonly layerI: Date; readonly valueI: bigint; }
export interface StressLayerJ extends StressLayerI { readonly layerJ: symbol; readonly valueJ: string; }
export interface StressLayerK extends StressLayerJ { readonly layerK: RegExp; readonly valueK: number; }
export interface StressLayerL extends StressLayerK { readonly layerL: string | undefined; readonly valueL: readonly [string, number]; }
export interface StressLayerM extends StressLayerL { readonly layerM: { readonly nested: string }; readonly valueM: number; }
export interface StressLayerN extends StressLayerM { readonly layerN: number[][]; readonly valueN: string; }
export interface StressLayerO extends StressLayerN { readonly layerO: PromiseLike<string>; readonly valueO: boolean; }
export interface StressLayerP extends StressLayerO { readonly layerP: Promise<number>; readonly valueP: never; }
export interface StressLayerQ extends StressLayerP { readonly layerQ: () => string; readonly valueQ: 'queued'; }
export interface StressLayerR extends StressLayerQ { readonly layerR: (payload: string) => number; readonly valueR: 0; }
export interface StressLayerS extends StressLayerR { readonly layerS: Iterable<string>; readonly valueS: 'running'; }
export interface StressLayerT extends StressLayerS { readonly layerT: ArrayBuffer; readonly valueT: 'stopped'; }
export interface StressLayerU extends StressLayerT { readonly layerU: ReadonlyMap<string, number>; readonly valueU: 'pending'; }
export interface StressLayerV extends StressLayerU { readonly layerV: ReadonlySet<string>; readonly valueV: 'complete'; }

export type DeepInterfaceChain = StressLayerA &
  StressLayerB &
  StressLayerC &
  StressLayerD &
  StressLayerE &
  StressLayerF &
  StressLayerG &
  StressLayerH &
  StressLayerI &
  StressLayerJ &
  StressLayerK &
  StressLayerL &
  StressLayerM &
  StressLayerN &
  StressLayerO &
  StressLayerP &
  StressLayerQ &
  StressLayerR &
  StressLayerS &
  StressLayerT &
  StressLayerU &
  StressLayerV;

export type RecursiveAccumulator<T, Depth extends number, Acc extends readonly unknown[] = readonly []> = Depth extends 0
  ? Acc
  : RecursiveAccumulator<T, Decrement<Depth>, readonly [T, ...Acc]>;

export type DeepFlatten<T> = T extends readonly [infer H, ...infer R]
  ? [H, ...DeepFlatten<R>]
  : T extends readonly unknown[]
    ? { [K in keyof T]: T[K] }
    : T;

export type TemplateMapped<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `meta/${K}` : never]: T[K] extends object ? TemplateMapped<Extract<T[K], Record<string, unknown>>> : T[K];
};

export type NestedTemplateMap<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `top.${K}` : never]: T[K] extends Record<string, unknown>
    ? {
        [R in keyof T[K] as R extends string ? `inner.${R}` : never]: T[K][R];
      }
    : T[K];
};

export type PreservedMapped<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
} & {
  [K in keyof T as `${string & K}-alias`]: T[K];
};

export type PathKeys<T> = T extends Date | string | number | boolean | bigint | symbol | null | undefined
  ? never
  : T extends readonly (infer U)[]
    ? `root.${number}` | `${`root.${number}`}.${PathKeys<U>}`
    : T extends Record<string, unknown>
      ? {
          [K in keyof T & string]: T[K] extends Record<string, unknown>
            ? `${K}` | `${K}.${PathKeys<T[K]>}`
            : K;
        }[keyof T & string]
      : never;

export type PathValue<T, P extends string> = P extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? PathValue<T[H], R>
    : never
  : P extends keyof T
    ? T[P]
    : never;

export type RecursiveMap<T, Depth extends number> = Depth extends 0
  ? { readonly leaf: true }
  : {
      readonly depth: Depth;
      readonly next: { [K in keyof T]: RecursiveMap<T[K], Decrement<Depth>> };
    };

export type RecursiveOdd<T, Depth extends number> = Depth extends 0
  ? { readonly terminal: T; readonly direction: 'odd'; }
  : RecursiveEven<{ readonly body: T; readonly depth: Depth }, Decrement<Depth>>;

export type RecursiveEven<T, Depth extends number> = Depth extends 0
  ? { readonly terminal: T; readonly direction: 'even'; }
  : RecursiveOdd<{ readonly body: T; readonly depth: Depth }, Decrement<Depth>>;

export type ConstraintMesh<
  A extends string,
  B extends `signal:${A}`,
  C extends readonly Record<A, B>[],
> = {
  readonly domain: A;
  readonly signal: B;
  readonly records: C;
  readonly checksum: `${A}-${B}`;
};

export interface StressPayload<T extends StressVerb> {
  readonly verb: T;
  readonly command: StressCommand;
  readonly envelope: ChainedCommandInput<`${T}:workload:high`>;
}

export type SolverTuple<Length extends number> = BuildTuple<Length, []> extends infer T extends unknown[]
  ? readonly [...T, ...T]
  : never;

export type SolverDiscriminated<T extends StressCommand> = ResolveCommand<T> extends infer R
  ? R extends { category: infer C; stage: infer S; domain: infer D }
    ? { readonly category: C; readonly stage: S; readonly domain: D; readonly command: T }
    : never
  : never;

export type IntersectedCatalog<T extends ReadonlyArray<Record<string, unknown>>> = T extends readonly [infer Head, ...infer Tail]
  ? Head & (Tail extends ReadonlyArray<Record<string, unknown>> ? IntersectedCatalog<Tail> : never)
  : unknown;

export type DeepCommandMap<TDomain extends readonly StressDomain[]> = {
  [Domain in TDomain[number]]: {
    [Verb in StressVerb]: {
      readonly domain: Domain;
      readonly verb: Verb;
      readonly route: `${Verb}:${Domain}:${StressSeverity}`;
      readonly severity: StressSeverity;
      readonly nesting: RecursiveTuple<5>;
    };
  };
};

export const stressDomains = [
  'agent',
  'artifact',
  'auth',
  'autoscaler',
  'build',
  'cache',
  'cdn',
  'cluster',
  'config',
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
  'nodepool',
  'observer',
  'orchestrator',
  'playbook',
  'policy',
  'pipeline',
  'planner',
  'queue',
  'recovery',
  'registry',
  'scheduler',
  'signal',
  'store',
  'telemetry',
  'workload',
] as const;

export type StressDomainUnion = (typeof stressDomains)[number];
