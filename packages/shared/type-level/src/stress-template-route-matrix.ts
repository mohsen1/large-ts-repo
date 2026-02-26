export type ActionToken =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'validate'
  | 'publish'
  | 'archive'
  | 'restore'
  | 'drain'
  | 'resume'
  | 'pause'
  | 'escalate'
  | 'resolve'
  | 'start'
  | 'synchronize'
  | 'reconcile';

export type DomainToken =
  | 'recovery'
  | 'incident'
  | 'policy'
  | 'telemetry'
  | 'orchestrator'
  | 'fabric'
  | 'playbook'
  | 'workbench'
  | 'mesh'
  | 'saga'
  | 'continuity'
  | 'quantum';

export type IdentifierToken =
  | `id-${number}`
  | `uuid-${string}`
  | `ref-${number}`
  | `slot-${number}`
  | `lane-${string}`
  | `hash-${string}`;

export type RouteTemplate = `/${DomainToken}/${ActionToken}/${IdentifierToken}`;
export type RouteTemplateOrLoose = RouteTemplate | `/${string}/${string}/${string}`;

export type RouteTemplateParts<T extends RouteTemplate> = T extends `/${infer D}/${infer A}/${infer I}`
  ? {
      readonly domain: D & DomainToken;
      readonly action: A & ActionToken;
      readonly id: I & IdentifierToken;
    }
  : never;

export type RouteRoute<T extends string> = T extends `${infer D}-${infer A}-${infer B}`
  ? {
      readonly left: D;
      readonly action: A;
      readonly target: B;
    }
  : {
      readonly unresolved: T;
    };

export type RouteMatch<T extends string> = T extends `/${infer D}/${infer A}/${infer I}`
  ? D extends DomainToken
    ? A extends ActionToken
      ? I extends IdentifierToken
        ? {
            readonly domain: D;
            readonly action: A;
            readonly id: I;
            readonly canonical: `/api/${D}/${A}/${I}`;
          }
        : never
      : never
    : never
  : never;

export type RouteVariant<T extends RouteTemplateOrLoose> = T extends `/${infer Prefix}/${infer Core}/${infer Tail}`
  ? Prefix extends 'v1' | 'v2' | 'v3'
    ? `/${Prefix}/${Core}/${Tail}`
    : `/v1/${Core}/${Tail}`
  : T;

export type RouteToKey<T extends RouteTemplate> = RouteMatch<T> extends {
  readonly domain: infer Domain;
  readonly action: infer Action;
  readonly id: infer Id;
}
  ? `${Domain & string}:${Action & string}:${Id & string}`
  : never;

export type RouteResolver<T extends RouteTemplate> = {
  readonly domain: RouteMatch<T>['domain'];
  readonly action: RouteMatch<T>['action'];
  readonly id: RouteMatch<T>['id'];
  readonly namespace: `${RouteMatch<T>['domain']}.catalog`;
  readonly event: `${RouteMatch<T>['action']}:${RouteMatch<T>['id']}`;
  readonly canonical: RouteMatch<T>['canonical'];
};

export type RouteResolverGrid<T extends readonly RouteTemplate[]> = {
  [K in keyof T]: T[K] extends RouteTemplate ? RouteResolver<T[K]> : never;
};

export type RouteDispatch<T extends RouteTemplate> = {
  readonly envelope: {
    readonly domain: RouteTemplateParts<T>['domain'];
    readonly action: RouteTemplateParts<T>['action'];
    readonly id: RouteTemplateParts<T>['id'];
    readonly trace: `${DomainToken}:${ActionToken}`;
  };
  readonly params: {
    readonly left: string;
    readonly action: string;
    readonly target: string;
  };
};

export type RouteIndex<T extends readonly RouteTemplate[]> = {
  [K in keyof T & number as RouteToKey<T[K]>]: T[K] extends RouteTemplate ? RouteDispatch<T[K]> : never;
};

export type RouteMap<T extends readonly RouteTemplate[]> = {
  readonly list: RouteResolverGrid<T>;
  readonly index: RouteIndex<T>;
};

export const routeTemplates = [
  '/recovery/create/id-1',
  '/incident/read/uuid-incident-42',
  '/policy/validate/slot-4',
  '/telemetry/publish/hash-stream',
  '/mesh/pause/uuid-edge',
  '/quantum/restore/lane-a',
  '/continuity/reconcile/id-88',
  '/saga/synchronize/ref-99',
  '/playbook/escalate/uuid-play',
  '/workbench/start/id-77',
] as const satisfies readonly RouteTemplate[];

export type RouteUnion = RouteTemplate | '/recovery/sweep/id-100' | '/incident/resolve/ref-77' | '/policy/apply/id-5' | '/telemetry/observe/lane-a';

export type RouteMatchTable = Record<string, RouteResolver<RouteTemplate> | undefined>;

export type RouteParam<T extends RouteTemplate> = T extends `/${infer D}/${infer A}/${infer I}`
  ? {
      readonly domain: D;
      readonly action: A;
      readonly id: I;
      readonly key: `${D}::${A}::${I}`;
    }
  : never;

export type RouteSignature<T extends RouteTemplate> = T extends `/${infer D}/${infer A}/${infer I}`
  ? `${Uppercase<D>}.${Uppercase<A>}.${I}`
  : never;

export const parseRoute = (raw: string): RouteTemplateParts<RouteTemplate> => {
  const [, domain, action, id] = raw.split('/') as [string, DomainToken, ActionToken, string];
  return { domain, action, id } as RouteTemplateParts<RouteTemplate>;
};

export const compileRoute = <T extends RouteTemplate>(template: T): RouteResolver<T> => {
  const [, domain, action, id] = template.split('/') as [string, DomainToken, ActionToken, IdentifierToken];
  return {
    domain,
    action,
    id,
    namespace: `${domain}.catalog`,
    canonical: `/api/${domain}/${action}/${id}`,
    event: `${action}:${id}`,
  } as RouteResolver<T>;
};

export const buildRouteRegistry = (): RouteMatchTable => {
  const registry = {} as RouteMatchTable;
  for (const raw of routeTemplates) {
    const key = `${raw.split('/')[1]}::${raw.split('/')[2]}`;
    registry[key] = compileRoute(raw);
  }
  return registry;
};

export const normalizeRoute = <T extends RouteTemplateOrLoose>(template: T): RouteVariant<T> => {
  if (template.startsWith('/v')) {
    return template as RouteVariant<T>;
  }
  return `/v1/${template.slice(1)}` as RouteVariant<T>;
};

export const resolveRouteDispatch = <T extends RouteTemplate>(template: T): RouteDispatch<T> => {
  const parts = parseRoute(template);
  return {
    envelope: {
      domain: parts.domain,
      action: parts.action,
      id: parts.id,
      trace: `${parts.domain}:${parts.action}`,
    },
    params: {
      left: `${parts.domain}-${parts.action}`,
      action: `${parts.action}`,
      target: `${parts.id}`,
    },
  };
};

export type RouteDispatchMatrix<T extends readonly RouteTemplate[] = typeof routeTemplates> = RouteMap<T>;
