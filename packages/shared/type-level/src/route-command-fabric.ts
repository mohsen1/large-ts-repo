export const entityCodes = [
  'identity',
  'fabric',
  'timeline',
  'signal',
  'policy',
  'chronicle',
  'saga',
  'continuity',
  'cadence',
  'forecast',
  'quantum',
  'fleet',
  'playbook',
  'audit',
  'incident',
  'readiness',
  'recovery',
  'mesh',
  'risk',
  'compliance',
] as const;

export type EntityCode = (typeof entityCodes)[number];

export type ActionCode = 'start' | 'stop' | 'inspect' | 'safeguard' | 'simulate' | 'review' | 'triage' | 'handoff';

export type RouteTemplate = `/${EntityCode}/${ActionCode}/${string}-${string}-${string}`;

export interface RouteRecord {
  readonly namespace: string;
  readonly domain: EntityCode;
  readonly action: ActionCode;
  readonly id: string;
}

export type RouteShape = `${string}/${string}/${string}`;

export type ExtractRouteParts<T extends RouteShape> = T extends `/${infer Entity}/${infer Action}/${infer Id}`
  ? Entity extends EntityCode
    ? Action extends ActionCode
      ? {
          entity: Entity;
          action: Action;
          id: Id;
          normalized: `/${Entity}/${Action}/${Id}` & RouteTemplate;
        }
      : never
    : never
  : never;

export type RouteMatch<T extends RouteShape> = T extends `/${infer Entity}/${infer Action}/${infer Tail}`
  ? {
      entity: Entity extends EntityCode ? Entity : 'fabric';
      action: Action extends ActionCode ? Action : 'start';
      tail: Tail;
      composite: Tail extends `${infer _A}-${infer B}-${infer C}` ? `${B}-${C}` : Tail;
    }
  : never;

export type ResolveByDomain<T> = T extends { entity: infer Candidate }
  ? Candidate extends EntityCode
    ? Candidate
    : never
  : never;

export type ResolveByAction<T> = T extends { action: infer Candidate }
  ? Candidate extends ActionCode
    ? Candidate
    : never
  : never;

export type RouteCatalog<T extends readonly RouteShape[]> = {
  [Index in keyof T]:
  T[Index] extends RouteShape
    ? ExtractRouteParts<T[Index] & RouteShape>
    : never;
};

export type RouteUnionToRecord<T extends RouteShape> = {
  entity: ResolveByDomain<ExtractRouteParts<T>>;
  action: ResolveByAction<ExtractRouteParts<T>>;
};

export interface DomainBlueprint extends Record<string, unknown> {
  readonly id: string;
  readonly entity: EntityCode;
  readonly version: `v${number}`;
}

export type BlueprintMap<T extends readonly DomainBlueprint[]> = {
  [TIndex in keyof T as T[TIndex] extends DomainBlueprint ? `${TIndex & number}_${T[TIndex]['entity']}` : never]: T[TIndex];
};

export type DomainActionMap<TDomain extends EntityCode, TAction extends ActionCode> = {
  [K in `${TDomain}-${TAction}-${string}`]: `${TDomain}.${TAction}`;
};

export type RouteChain<TInput extends readonly RouteShape[], TIndex extends number = 0> = TInput extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends RouteShape
    ? {
        readonly step: TIndex;
        readonly route: Head;
        readonly parsed: ExtractRouteParts<Head>;
        readonly next: RouteChain<Extract<Tail, readonly RouteShape[]>, Increment<TIndex>>;
      }
    : never
  : never;

export type Increment<T extends number> = [...Array<T>, unknown]['length'];
export type PathPattern<
  TInput extends string,
  Depth extends number = 4,
> = Depth extends 0
  ? TInput
  : TInput extends `${infer Head}/${infer Tail}`
    ? `${Head}.${PathPattern<Tail, Increment<Depth>>}`
    : `${TInput}-${Depth}`;

export type ComposeRoute<
  TDomain extends EntityCode,
  TAction extends ActionCode,
  TId extends string,
  TStage extends string = 'v1',
> = `/${TDomain}/${TAction}/${TAction}-${TId}-${TStage}`;

export type RouteMap<T extends string[]> = {
  [K in T[number]]: ComposeRoute<K extends EntityCode ? K : 'fabric', 'start', K>;
};

export const routeTemplates = entityCodes;

export const actionTemplates = [
  'start',
  'stop',
  'inspect',
  'simulate',
  'review',
  'triage',
  'handoff',
  'safeguard',
] as const satisfies readonly ActionCode[];

export const routeTable: Record<string, RouteRecord> = routeTemplates.flatMap((domain, domainIndex) =>
  actionTemplates.map((action, actionIndex) => {
    const id = `${action}-${domainIndex}-${actionIndex}-${Math.abs(Math.sin(domainIndex + actionIndex) * 10000).toFixed(0)}`;
    return {
      namespace: 'stress-lab',
      domain,
      action,
      id,
    };
  }),
).reduce<Record<string, RouteRecord>>((acc, record) => {
  const key = `${record.domain}/${record.action}/${record.id}`;
  acc[key] = record;
  return acc;
}, {});

export const buildRoute = (domain: EntityCode, action: ActionCode, id: string): `/${string}/${string}/${string}` => {
  return `/${domain}/${action}/${id}-${id}-${Date.now()}`;
};

export const parseRoute = (route: string): RouteRecord | null => {
  const segments = route.split('/').filter(Boolean);
  if (segments.length < 3) {
    return null;
  }
  const [entity, action, ...rest] = segments;
  if (!routeTemplates.includes(entity as EntityCode) || !actionTemplates.includes(action as ActionCode)) {
    return null;
  }
  const id = rest.join('-');
  if (!id) {
    return null;
  }
  return {
    namespace: 'stress-lab',
    domain: entity as EntityCode,
    action: action as ActionCode,
    id,
  };
};

export const parseWithInference = <T extends RouteShape>(path: T): ExtractRouteParts<T> | null => {
  const match = /^\/([^/]+)\/([^/]+)\/([^-]+)-([^-]+)-(.+)$/.exec(path);
  if (!match) {
    return null;
  }
  const [, entity, action, ...tail] = match;
  const [id, ...identityRest] = tail;
  if (!routeTemplates.includes(entity as EntityCode) || !actionTemplates.includes(action as ActionCode)) {
    return null;
  }
  if (id === undefined) {
    return null;
  }
  const routeEntity = entity as EntityCode;
  const routeAction = action as ActionCode;
  const computedId = [id, ...identityRest].join('-');
  const normalized = `/${routeEntity}/${routeAction}/${computedId}` as RouteTemplate;
  return {
    entity: routeEntity,
    action: routeAction,
    id: computedId,
    normalized,
  } as ExtractRouteParts<T>;
};

export const normalizeRoute = (record: RouteRecord): RouteShape => {
  return `/${record.domain}/${record.action}/${record.id}` as RouteShape;
};

export const routeRegistry = (records: readonly RouteRecord[]): ReadonlyMap<string, RouteRecord> => {
  const map = new Map<string, RouteRecord>();
  for (const record of records) {
    const key = `${record.domain}:${record.action}:${record.id}`;
    if (map.has(key)) {
      continue;
    }
    map.set(key, record);
  }
  return map;
};
