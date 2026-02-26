import type { Brand } from './patterns';
import type { Decrement } from './stress-orchestrator-mesh';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type KeySeed =
  | 'id'
  | 'tenant'
  | 'domain'
  | 'mode'
  | 'severity'
  | 'route'
  | 'policy'
  | 'signal'
  | 'timeline'
  | 'orchestrator'
  | 'trace'
  | 'attempt'
  | 'checksum'
  | 'status'
  | 'outcome';

export interface EventEnvelope<T extends string = string> {
  readonly name: T;
  readonly id: Brand<string, 'event-id'>;
  readonly tags: readonly T[];
}

export type RemapRouteKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `recovery.${K}` : never]: T[K] extends Date
    ? T[K]['toISOString']
    : T[K] extends number
      ? `${T[K]}`
      : T[K] extends string
        ? `v:${T[K]}`
        : T[K] extends Array<infer U>
          ? U[]
          : T[K] extends Record<string, unknown>
            ? NestedRemap<T[K], `${Extract<K, string>}.`>
            : T[K];
};

export type NestedRemap<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}${K}` : never]: T[K] extends Date
    ? T[K]['toISOString']
    : T[K] extends Array<infer U>
      ? U[]
      : T[K] extends Record<string, unknown>
        ? NestedRemap<T[K], `${Prefix}${Extract<K, string>}.`>
        : T[K];
};

export type PreserveAndAlias<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
} & {
  [K in keyof T as `${string & K}-alias`]: T[K];
};

export type RouteTemplateToken<T extends string> = `/${T}/route/{${T}}`;

export type DomainRoute<TDomain extends string, TVerb extends string, TMode extends string, TSeverity extends string> =
  `${TDomain}/${TVerb}/${TMode}/${TSeverity}`;

export type DomainCatalog<TDomain extends ReadonlyArray<string>> = {
  [K in TDomain[number]]: K extends string
    ? {
        readonly root: Brand<K, 'domain-root'>;
        readonly route: RouteTemplateToken<K>;
        readonly variants: {
          readonly discover: DomainRoute<K, 'discover', 'live', 'low'>;
          readonly drill: DomainRoute<K, 'drill', 'simulation', 'critical'>;
          readonly dispatch: DomainRoute<K, 'dispatch', 'dry-run', 'moderate'>;
        };
      }
    : never;
};

export type DeepCatalog<T extends Record<string, unknown>, Depth extends number> = Depth extends 0
  ? { readonly leaf: true; readonly seed: NoInfer<T> }
  : {
      readonly layer: Depth;
      readonly keys: keyof T;
      readonly nested: {
        [K in keyof T]: T[K] extends Record<string, unknown>
          ? DeepCatalog<T[K], Decrement<Depth>>
          : {
              readonly value: T[K];
              readonly frozen: readonly [T[K], string];
            };
      };
    };

export type ParseRouteTemplate<T extends string> = T extends `/${infer Domain}/${infer Verb}/${infer Mode}/${infer Severity}`
  ? {
      readonly domain: Domain;
      readonly verb: Verb;
      readonly mode: Mode;
      readonly severity: Severity;
    }
  : never;

export type RouteTemplateUnion =
  | '/agent/discover/live/low'
  | '/mesh/dispatch/simulation/high'
  | '/signal/heal/replay/critical'
  | '/policy/verify/backfill/moderate'
  | '/incident/recover/live/emergency'
  | '/timeline/plan/simulation/high'
  | '/telemetry/simulate/dry-run/low'
  | '/catalog/audit/forecast/observability'
  | '/fabric/throttle/simulation/high'
  | '/gateway/contain/replay/high';

export type RouteTemplateMap<TUnion extends string> = {
  [K in TUnion as K extends string ? `tpl/${K}` : never]: ParseRouteTemplate<K>;
};

export type RouteTemplateProjectionMap = RouteTemplateMap<RouteTemplateUnion>;

export type RouteTemplateByMode<TUnion extends string, TMode extends string> = {
  [K in TUnion & string]: ParseRouteTemplate<K> extends { readonly mode: TMode } ? K : never
}[TUnion & string];

export type RecursiveFold<T extends readonly string[], Prefix extends string = 'base'> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends string
    ? Tail extends readonly string[]
      ? {
          readonly [K in Head]: {
            readonly key: `${Prefix}:${Head}`;
            readonly body: RecursiveFold<Tail, `${Prefix}.${Head}`>;
          };
        }
      : {}
    : {}
  : {};

export type RoutePathTuple<T extends string, Depth extends number = 8, Acc extends string[] = []> = Depth extends 0
  ? Acc
  : T extends `${infer Head}/${infer Rest}`
    ? RoutePathTuple<Rest, Decrement<Depth>, [...Acc, Head]>
    : [...Acc, T];

export type RouteChain<T extends string> = RoutePathTuple<T>;

export type RouteSegmentsToMap<T extends string> = RouteChain<T> extends infer Chain extends readonly string[]
  ? DeepMapFromTuple<Chain>
  : never;

export type DeepMapFromTuple<T extends readonly string[], Acc extends object = {}> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends string
    ? {
        [K in Head]: Tail extends readonly string[] ? DeepMapFromTuple<Tail> : never;
      }
    : Acc
  : Acc;

export type RouteSegmentCatalog<T extends string[]> = T[number] extends infer Route
  ? Route extends string
    ? RouteSegmentsToMap<Route>
    : never
  : never;

export const baseTemplateSeed = [
  {
    name: 'recovery-plan',
    route: '/agent/discover/live/low',
  },
  {
    name: 'timeline-forecast',
    route: '/timeline/plan/simulation/high',
  },
  {
    name: 'policy-verification',
    route: '/policy/verify/backfill/moderate',
  },
] as const satisfies readonly {
  readonly name: 'recovery-plan' | 'timeline-forecast' | 'policy-verification';
  readonly route: RouteTemplateUnion;
}[];

export type TemplateSeedEntry = (typeof baseTemplateSeed)[number];

export type SeedPayload<T extends TemplateSeedEntry['name']> = Extract<TemplateSeedEntry, { readonly name: T }>['name'];

export type TemplateProjection<TEntries extends readonly TemplateSeedEntry[]> = {
  [E in TEntries[number] as E['name']]: {
    readonly id: Brand<string, 'template-id'>;
    readonly source: E['route'];
    readonly parsed: ParseRouteTemplate<E['route']>;
  }
};

export type TemplateProjectionMap = TemplateProjection<typeof baseTemplateSeed>;

export type ParsedTemplateParts<T extends RouteTemplateUnion> = ParseRouteTemplate<T>;

export type TemplateUnion<T extends RouteTemplateUnion> = ParsedTemplateParts<T> extends {
  readonly domain: infer Domain;
  readonly verb: infer Verb;
  readonly mode: infer Mode;
  readonly severity: infer Severity;
}
  ? ParsedTemplateParts<T> & {
      readonly template: `tpl:${Domain & string}:${Verb & string}:${Mode & string}`;
      readonly severityMarker: Severity & string;
    }
  : never;

export const compileTemplateProjection = (entries: readonly TemplateSeedEntry[]): TemplateProjectionMap => {
  const result: Record<string, { readonly id: Brand<string, 'template-id'>; readonly source: RouteTemplateUnion; readonly parsed: ParseRouteTemplate<RouteTemplateUnion> }> = {};
  for (const entry of entries) {
    result[entry.name] = {
      id: `id-${entry.name}` as Brand<string, 'template-id'>,
      source: entry.route,
      parsed: parseTemplate(entry.route),
    };
  }
  return result as TemplateProjectionMap;
};

const parseTemplate = <T extends TemplateSeedEntry['route']>(route: T): ParseRouteTemplate<T> => {
  const [, domain, verb, mode, severity] = route.split('/') as [string, string, string, string, string];

  return {
    domain,
    verb,
    mode,
    severity,
  } as ParseRouteTemplate<T>;
};

export const templateRouteMap = compileTemplateProjection(baseTemplateSeed);

export const routeDomainUnion = [
  'agent',
  'mesh',
  'signal',
  'policy',
  'incident',
  'timeline',
  'telemetry',
  'catalog',
  'fabric',
  'gateway',
] as const;

export type RouteDomain = (typeof routeDomainUnion)[number];

export type RouteDomainCatalog = {
  readonly [D in RouteDomain]: {
    readonly domain: D;
    readonly route: DomainRoute<D, 'recover' | 'dispatch' | 'verify', 'live' | 'simulation', 'high' | 'critical' | 'moderate'>;
    readonly aliases: {
      readonly short: `${D}-alias`;
      readonly canonical: `/${D}/`;
    };
  };
};

type MutableRouteDomainCatalog = {
  [D in RouteDomain]: {
    domain: D;
    route: DomainRoute<D, 'recover' | 'dispatch' | 'verify', 'live' | 'simulation', 'high' | 'critical' | 'moderate'>;
    aliases: {
      short: `${D}-alias`;
      canonical: `/${D}/`;
    };
  };
};

const builtDomainCatalog = routeDomainUnion.reduce((acc, domain) => {
  acc[domain] = {
    domain,
    route: `${domain}/recover/live/high` as DomainRoute<RouteDomain, 'recover', 'live', 'high'>,
    aliases: {
      short: `${domain}-alias`,
      canonical: `/${domain}/`,
    },
  } as MutableRouteDomainCatalog[RouteDomain];
  return acc;
}, {} as Record<RouteDomain, MutableRouteDomainCatalog[RouteDomain]>);

export const domainCatalog: RouteDomainCatalog = builtDomainCatalog as RouteDomainCatalog;

export type RecursiveTemplateAccumulator<
  T extends string,
  Limit extends number,
  Acc extends readonly unknown[] = [],
> = Acc['length'] extends Limit
  ? readonly []
  : readonly [T, ...RecursiveTemplateAccumulator<`next:${T}`, Limit, [...Acc, unknown]>];

export type TemplateStack = RecursiveTemplateAccumulator<RouteTemplateUnion, 12>;

export interface TemplateStackEnvelope {
  readonly root: Brand<string, 'template-stack'>;
  readonly levels: TemplateStack;
}
