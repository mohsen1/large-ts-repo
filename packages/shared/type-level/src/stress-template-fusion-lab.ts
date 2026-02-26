export type FabricDomain =
  | 'recovery'
  | 'incident'
  | 'fabric'
  | 'policy'
  | 'mesh'
  | 'timeline'
  | 'telemetry'
  | 'signal'
  | 'continuity'
  | 'governance'
  | 'orchestration';

export type FabricVerb =
  | 'open'
  | 'close'
  | 'pause'
  | 'resume'
  | 'scale'
  | 'inspect'
  | 'drain'
  | 'heal'
  | 'audit'
  | 'alert'
  | 'snapshot'
  | 'stabilize'
  | 'triage'
  | 'route'
  | 'bind';

export type FabricId =
  | 'alpha'
  | 'beta'
  | 'gamma'
  | 'delta'
  | 'epsilon'
  | 'zeta'
  | 'eta'
  | 'theta'
  | 'iota'
  | 'kappa';

export type SegmentByVerb = {
  readonly recovery: 'open' | 'stabilize' | 'snapshot' | 'resolve';
  readonly incident: 'triage' | 'inspect' | 'audit' | 'open';
  readonly fabric: 'heal' | 'drain' | 'open' | 'close';
  readonly policy: 'pause' | 'resume' | 'alert' | 'bind';
  readonly mesh: 'scale' | 'close' | 'inspect' | 'route';
  readonly timeline: 'open' | 'snapshot' | 'audit' | 'resume';
  readonly telemetry: 'inspect' | 'close' | 'open';
  readonly signal: 'pause' | 'resume' | 'alert';
  readonly continuity: 'heal' | 'scale' | 'audit';
  readonly governance: 'open' | 'close' | 'pause';
  readonly orchestration: 'inspect' | 'stabilize' | 'drain';
};

type FabricIdFor<D extends FabricDomain> = D extends 'recovery'
  ? 'alpha'
  : D extends 'incident'
    ? 'beta'
    : D extends 'fabric'
      ? 'gamma'
      : D extends 'policy'
        ? 'delta'
        : D extends 'mesh'
          ? 'epsilon'
          : D extends 'timeline'
            ? 'zeta'
            : D extends 'telemetry'
              ? 'eta'
              : D extends 'signal'
                ? 'theta'
                : D extends 'continuity'
                  ? 'iota'
                  : D extends 'governance'
                    ? 'kappa'
                    : D extends 'orchestration'
                      ? 'alpha'
                      : 'alpha';

export type FabricSegment = `${FabricDomain}-${FabricVerb}-${FabricId}`;

type SegmentForDomain<D extends FabricDomain> = `${D}-${SegmentByVerb[D] & string}-${FabricIdFor<D>}`;
export type SegmentChain = {
  [D in FabricDomain]: SegmentForDomain<D>;
}[FabricDomain];

export type TemplateRoute<T extends string> = T extends `${infer Domain}-${infer Verb}-${infer Id}`
  ? Domain extends FabricDomain
    ? Verb extends FabricVerb
      ? `/${Domain}/${Verb}/${Id}`
      : never
    : never
  : never;

export type RouteInference<T extends string> = T extends `/${infer Domain}/${infer Verb}/${infer Id}`
  ? Domain extends FabricDomain
    ? Verb extends FabricVerb
      ? {
          readonly domain: Domain;
          readonly verb: Verb;
          readonly id: Id;
          readonly key: `${Domain}.${Verb}.${Id}`;
        }
      : never
    : never
  : never;

export type RouteUnion<T extends string> = T extends FabricSegment ? RouteInference<TemplateRoute<T>> : never;

export type SegmentMap = {
  readonly [K in SegmentChain as K extends `${infer A}-${infer B}-${infer C}` ? `${A}/${B}/${C}` : K]: RouteInference<TemplateRoute<K>>;
};

export type TemplateKeys<T extends Record<string, unknown>> = {
  [K in keyof T & string as `tpl:${K}`]: K;
};

export type NestedTemplateRemap<T extends Record<FabricDomain, Record<string, unknown>>> = {
  [Domain in keyof T & FabricDomain]: {
    [Verb in keyof T[Domain] & string as `${Domain}/${Verb}`]: {
      readonly domain: Domain;
      readonly verb: Verb;
      readonly value: T[Domain][Verb];
      readonly path: TemplateRoute<`${Domain & string}-${Verb & string}-${FabricIdFor<Domain & FabricDomain>}`>;
    };
  };
};

export type TemplateResolver<
  TRoute extends SegmentChain,
  TVerb extends string = TRoute extends `${string}-${infer Verb}-${string}` ? Verb : never,
> = TVerb extends 'open' | 'resume' | 'heal'
  ? `open-${TRoute}`
  : TVerb extends 'close' | 'drain'
    ? `close-${TRoute}`
    : TVerb extends 'triage' | 'audit' | 'snapshot'
      ? `inspect-${TRoute}`
      : `action-${TRoute}`;

export type RouteTemplateKey<T extends string> = T extends `${infer D}/${infer V}/${infer I}` ? `${V}:${D}:${I}` : never;

export type DeepTemplateChain<T extends readonly SegmentChain[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends SegmentChain
    ? {
        readonly head: TemplateRoute<Head>;
        readonly routeKey: RouteTemplateKey<TemplateRoute<Head>>;
        readonly resolver: TemplateResolver<Head>;
        readonly next: Tail extends readonly SegmentChain[] ? DeepTemplateChain<Tail> : never;
      }
    : never
  : {
      readonly head: never;
      readonly routeKey: never;
      readonly resolver: never;
      readonly next: never;
    };

export const templateCatalog = [
  'recovery-open-alpha',
  'recovery-stabilize-alpha',
  'recovery-snapshot-alpha',
  'incident-open-beta',
  'incident-inspect-beta',
  'incident-audit-beta',
  'fabric-heal-gamma',
  'fabric-drain-gamma',
  'fabric-open-gamma',
  'policy-pause-delta',
  'policy-resume-delta',
  'policy-alert-delta',
  'mesh-scale-epsilon',
  'mesh-inspect-epsilon',
  'mesh-close-epsilon',
  'timeline-open-zeta',
  'timeline-snapshot-zeta',
  'timeline-audit-zeta',
  'telemetry-inspect-eta',
  'telemetry-close-eta',
  'telemetry-open-eta',
  'signal-pause-theta',
  'signal-resume-theta',
  'signal-alert-theta',
  'continuity-heal-iota',
  'continuity-scale-iota',
  'continuity-audit-iota',
  'governance-open-kappa',
  'governance-close-kappa',
  'governance-pause-kappa',
  'orchestration-inspect-alpha',
  'orchestration-stabilize-alpha',
  'orchestration-drain-alpha',
] as const;

export type TemplateCatalog = (typeof templateCatalog)[number];

const runtimeDomainToId: Record<FabricDomain, FabricId> = {
  recovery: 'alpha',
  incident: 'beta',
  fabric: 'gamma',
  policy: 'delta',
  mesh: 'epsilon',
  timeline: 'zeta',
  telemetry: 'eta',
  signal: 'theta',
  continuity: 'iota',
  governance: 'kappa',
  orchestration: 'alpha',
};

export const inferTemplate = <T extends SegmentChain>(value: T): TemplateRoute<T> => {
  const [domain, verb, id] = value.split('-') as [FabricDomain, FabricVerb, string];
  return `/${domain}/${verb}/${id}` as TemplateRoute<T>;
};

export const normalizeTemplateRecord = (templates: readonly SegmentChain[]) => {
  return templates.reduce<Record<TemplateCatalog, string>>((acc, template) => {
    const route = inferTemplate(template as SegmentChain);
    acc[template as TemplateCatalog] = route;
    return acc;
  }, {} as Record<TemplateCatalog, string>);
};

export const parsedTemplate = <T extends SegmentChain>(template: T): RouteInference<TemplateRoute<T>> => {
  const [domain, verb, id] = inferTemplate(template).split('/').slice(1) as [FabricDomain, FabricVerb, string];
  return {
    domain,
    verb,
    id,
    key: `${domain}.${verb}.${id}`,
  } as RouteInference<TemplateRoute<T>>;
};

export const mappedTemplateSet = <T extends Record<FabricDomain, Record<string, unknown>>>(input: T): NestedTemplateRemap<T> => {
  const output = {} as NestedTemplateRemap<T>;
  for (const domainKey of Object.keys(input) as Array<keyof T & FabricDomain>) {
    const domainMap = Object.fromEntries(
      Object.entries(input[domainKey] as Record<string, unknown>).map(([verb, value]) => {
        const safeVerb = verb as keyof T[typeof domainKey] & string;
        const path = `/${domainKey}/${safeVerb}/${runtimeDomainToId[domainKey]}` as TemplateRoute<`${typeof domainKey & string}-${string}-${string}`>;
        return [`${domainKey}/${safeVerb}`, { domain: domainKey, verb: safeVerb, value, path }];
      }),
    ) as Record<
      string,
      {
        domain: typeof domainKey;
        verb: keyof T[typeof domainKey] & string;
        value: T[typeof domainKey][keyof T[typeof domainKey] & string];
        path: TemplateRoute<`${typeof domainKey & string}-${string}-${string}`>;
      }
    >;

    output[domainKey] = domainMap as NestedTemplateRemap<T>[typeof domainKey];
  }

  return output;
};

export const templateUnion = templateCatalog.reduce(
  (acc, current) => {
    acc[current as TemplateCatalog] = inferTemplate(current as SegmentChain);
    return acc;
  },
  {} as Record<TemplateCatalog, TemplateRoute<SegmentChain>>,
);

export const templateCatalogRoutes: { readonly [K in TemplateCatalog]: TemplateRoute<SegmentChain> } = templateUnion;

const neverTemplateChain = {
  head: '/recovery/open/alpha' as never,
  routeKey: 'never:never:never' as never,
  resolver: 'action-never' as never,
  next: null as never,
} as DeepTemplateChain<[]>;

export const buildTemplateChain = <T extends readonly SegmentChain[]>(input: T): DeepTemplateChain<T> => {
  const [head, ...tail] = input;
  if (!head) {
    return neverTemplateChain as unknown as DeepTemplateChain<T>;
  }

  const route = inferTemplate(head);
  const node = {
    head: route,
    routeKey: `${head.split('-')[1]}:${head.split('-')[0]}:${head.split('-')[2]}` as RouteTemplateKey<typeof route>,
    resolver: `action-${head}` as TemplateResolver<T[number]>,
    next: (tail.length
      ? buildTemplateChain((tail as unknown) as T)
      : neverTemplateChain) as DeepTemplateChain<T>,
  };
  return node as DeepTemplateChain<T>;
};

export const flattenTemplateTokens = (route: string): readonly string[] => route.split('/').filter(Boolean);

export const routeFromTokens = (route: string): { domain: string; verb: string; id: string } => {
  const [domain, verb, id] = route.split('/') as [string, string, string];
  return { domain, verb, id };
};

export const mapTemplates = <const T extends readonly SegmentChain[]>(templates: T) => {
  const output = {} as {
    [K in keyof T as K extends number ? `route:${K}` : never]: TemplateRoute<T[K] & SegmentChain>;
  };
  for (const [index, template] of templates.entries()) {
    const key = `route:${index}` as keyof typeof output;
    (output as Record<string, TemplateRoute<SegmentChain>>)[key as string] = inferTemplate(template) as TemplateRoute<
      T[typeof index & keyof T] & SegmentChain
    >;
  }
  return output;
};

export const segmentPath = (template: SegmentChain): `/${string}/${string}/${string}` => {
  const [domain, verb, id] = template.split('-') as [string, string, string];
  return `/${domain}/${verb}/${id}`;
};

export const routeMapFromCatalog = <const T extends readonly SegmentChain[]>(catalog: T) => {
  return catalog.reduce<Record<TemplateCatalog, TemplateRoute<SegmentChain>>>((acc, route) => {
    acc[route as TemplateCatalog] = inferTemplate(route);
    return acc;
  }, {} as Record<TemplateCatalog, TemplateRoute<SegmentChain>>);
};
