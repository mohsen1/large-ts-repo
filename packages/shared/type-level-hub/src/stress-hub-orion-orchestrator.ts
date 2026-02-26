export type Brand<T, B extends string> = T & { readonly __brand: B };
export type NoInfer<T> = T;

export type HubOrionDomain = 'node' | 'mesh' | 'playbook' | 'incident' | 'telemetry';
export type HubOrionVerb = 'orchestrate' | 'synchronize' | 'observe' | 'resolve' | 'drill';
export type HubOrionPolicy<K extends string> = `policy:${K}`;

export type HubOrionEnvelope<K extends string, P> = Readonly<{
  readonly kind: Brand<K, 'hub-orion-kind'>;
  readonly payload: P;
  readonly policy: HubOrionPolicy<K>;
  readonly domain: HubOrionDomain;
  readonly active: boolean;
}>;

export type HubOrionDiscriminant = {
  readonly scope: HubOrionDomain;
  readonly verb: HubOrionVerb;
  readonly source: string;
};

export type HubOrionResolve<T extends HubOrionDiscriminant> = T['scope'] extends 'node'
  ? { readonly plane: 'node-plane'; readonly tag: 'graph' }
  : T['scope'] extends 'mesh'
    ? { readonly plane: 'mesh-plane'; readonly tag: 'signal' }
    : T['scope'] extends 'playbook'
      ? { readonly plane: 'playbook-plane'; readonly tag: 'control' }
      : T['scope'] extends 'incident'
        ? { readonly plane: 'incident-plane'; readonly tag: 'event' }
        : { readonly plane: 'telemetry-plane'; readonly tag: 'metric' };

export type HubOrionDispatch<
  K extends string,
  P,
  S extends HubOrionDiscriminant,
> = {
  readonly envelope: HubOrionEnvelope<K, P>;
  readonly route: HubOrionResolve<S>;
};

export type HubOrionTuple<
  T extends readonly HubOrionDiscriminant[],
  Acc extends readonly unknown[] = [],
> = T extends readonly [infer H, ...infer R]
  ? H extends HubOrionDiscriminant
    ? HubOrionTuple<R & readonly HubOrionDiscriminant[], [...Acc, HubOrionResolve<H>]>
    : Acc
  : Acc;

export type HubOrionUnion<T extends readonly HubOrionDiscriminant[]> = T[number];

export type HubOrionResolutionSet<T extends readonly HubOrionDiscriminant[]> = {
  readonly tuples: HubOrionTuple<T>;
  readonly union: HubOrionUnion<T>;
  readonly dispatch: HubOrionUnion<T> extends HubOrionDiscriminant ? HubOrionResolve<HubOrionUnion<T>> : never;
};

export type HubOrionTemplate<
  T extends string,
  S extends string,
  P extends string,
> = `${T}:${S}:${NoInfer<P>}`;

export const hubOrionSeed = [
  {
    scope: 'mesh',
    verb: 'orchestrate',
    source: 'runner',
  },
  {
    scope: 'node',
    verb: 'synchronize',
    source: 'bridge',
  },
  {
    scope: 'playbook',
    verb: 'observe',
    source: 'console',
  },
  {
    scope: 'incident',
    verb: 'resolve',
    source: 'orchestrator',
  },
  {
    scope: 'telemetry',
    verb: 'drill',
    source: 'saga',
  },
] as const satisfies readonly HubOrionDiscriminant[];

export const hubOrionRegistry = {
  planes: hubOrionSeed,
  payloads: hubOrionSeed.map((entry) => ({
    kind: `kind:${entry.scope}` as HubOrionEnvelope<string, unknown>['kind'],
    payload: { scope: entry.scope },
    policy: `policy:${entry.scope}` as HubOrionPolicy<string>,
    domain: entry.scope,
    active: entry.verb === 'orchestrate',
  })),
  route: {
    scope: hubOrionSeed[0].scope,
    verb: hubOrionSeed[0].verb,
    source: hubOrionSeed[0].source,
  } as HubOrionDiscriminant,
} as const;
