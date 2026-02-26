export type EventDomain =
  | 'auth'
  | 'billing'
  | 'catalog'
  | 'incident'
  | 'lattice'
  | 'ops'
  | 'orchestrator'
  | 'policy'
  | 'quantum'
  | 'recovery'
  | 'risk'
  | 'signal'
  | 'telemetry'
  | 'timeline';

export type EventAction =
  | 'ack'
  | 'archive'
  | 'create'
  | 'dispatch'
  | 'discover'
  | 'escalate'
  | 'observe'
  | 'project'
  | 'reconcile'
  | 'recover'
  | 'release'
  | 'repair'
  | 'route'
  | 'seal'
  | 'simulate'
  | 'suspend'
  | 'verify';

export type EventKind = 'incident' | 'signal' | 'workflow' | 'forecast' | 'playbook' | 'artifact';
export type EventVersion = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9';
export type EventId = `${string}.${string}`;
export type EventRoute = `/${EventDomain}/${EventAction}/${EventKind}/${EventId}/${EventVersion}`;

export const eventCatalogSeed = [
  '/incident/discover/incident/id_100.v1/v1',
  '/incident/observe/signal/sig_200.v2/v2',
  '/ops/dispatch/workflow/wf_300.v3/v1',
  '/ops/simulate/artifact/ar_400.v4/v3',
  '/policy/release/playbook/pb_500.v5/v1',
  '/recovery/repair/workflow/wf_600.v6/v2',
  '/risk/recover/incident/in_700.v7/v3',
  '/telemetry/verify/forecast/fc_800.v8/v1',
  '/quantum/dispatch/artifact/ar_801.v9/v2',
  '/signal/observe/signal/sg_902.v3/v1',
  '/ops/archive/playbook/pb_903.v4/v3',
  '/timeline/simulate/workflow/wf_904.v5/v2',
] as const satisfies readonly EventRoute[];

export type EventUnion = (typeof eventCatalogSeed)[number];

export type EventParts<T extends EventUnion> = T extends `/${infer TDomain}/${infer TAction}/${infer TKind}/${infer TId}/${infer TVersion}`
  ? {
      readonly domain: TDomain;
      readonly action: TAction;
      readonly kind: TKind;
      readonly id: TId;
      readonly version: TVersion;
      readonly raw: T;
    }
  : never;

export type EventTemplateKey<T extends EventUnion> = T extends `/${infer D}/${infer A}/${infer K}/${infer I}/${infer V}`
  ? Uppercase<`EVENT_${D}_${A}_${K}_${I}_${V}`>
  : never;

export type EventTemplateMap<T extends readonly EventUnion[] = readonly EventUnion[]> = {
  readonly [key: string]: {
    readonly key: EventTemplateKey<T[number]>;
    readonly route: T[number];
    readonly path: T[number];
    readonly normalized: string;
    readonly priority: number;
  };
};

export type EventTemplateMapByKind = {
  [K in EventKind]: EventUnion[];
};

export type EventCategory<T extends EventUnion> = EventParts<T>['kind'] extends 'incident'
  ? 'observability' | 'operations'
  : EventParts<T>['kind'] extends 'signal'
    ? 'alerting'
    : EventParts<T>['kind'] extends 'forecast'
      ? 'modeling'
      : 'artifact';

export type EventProfile<T extends EventUnion = EventUnion> = {
  readonly route: T;
  readonly parts: EventParts<T>;
  readonly score: string;
  readonly category: EventCategory<T>;
  readonly compositeKey: string;
};

export type EventMapEnvelope<T extends readonly EventUnion[] = readonly EventUnion[], _NS extends string = 'catalog'> = {
  routes: T;
  rows: EventProfile<T[number]>[];
  reverse: EventTemplateMap<T>;
  profiles: Record<string, EventProfile<T[number]>>;
  byKind: EventTemplateMapByKind;
};

export const eventCatalog = [...eventCatalogSeed] as const;

const eventTemplateKey = <T extends EventUnion>(route: T): EventTemplateKey<T> => {
  const value = `EVENT_${route.replaceAll('/', '_').replaceAll('.', '_').toUpperCase()}`;
  return value as EventTemplateKey<T>;
};

const parseEvent = <T extends EventUnion>(route: T): EventParts<T> => {
  const [, domain, action, kind, id, version] = route.split('/');
  return {
    domain,
    action,
    kind,
    id,
    version,
    raw: route,
  } as EventParts<T>;
};

const eventCategoryFromString = <T extends EventUnion>(route: T): EventCategory<T> => {
  const parts = parseEvent(route);
  if (parts.kind === 'forecast') {
    return 'modeling' as EventCategory<T>;
  }
  if (parts.kind === 'signal') {
    return 'alerting' as EventCategory<T>;
  }
  if (parts.kind === 'incident') {
    const action = parts.action as string;
    return (action === 'discover' || action === 'observe' ? 'observability' : 'operations') as EventCategory<T>;
  }
  return 'artifact' as EventCategory<T>;
};

export const eventTemplates = eventCatalog.reduce((acc, route) => {
  const key = eventTemplateKey(route);
  acc[key] = {
    key,
    route,
    path: route,
    normalized: route.toUpperCase(),
    priority: route.length,
  };
  return acc;
}, {} as { [key: string]: { readonly key: string; readonly route: EventUnion; readonly path: EventUnion; readonly normalized: string; readonly priority: number } }) as EventTemplateMap<
  typeof eventCatalog
>;

export const eventProfiles = eventCatalog.reduce((acc, route) => {
  const parts = parseEvent(route);
  const profile: EventProfile<typeof route> = {
    route,
    parts,
    score: `${parts.action}-${parts.kind}`,
    category: eventCategoryFromString(route),
    compositeKey: `event:${route.length}:${eventCategoryFromString(route)}`,
  };
  acc.rows.push(profile);
  acc.profiles[route] = profile;
  const kind = parseEvent(route).kind as EventKind;
  switch (kind) {
    case 'incident':
      (acc.byKind.incident as EventUnion[]).push(route);
      break;
    case 'signal':
      (acc.byKind.signal as EventUnion[]).push(route);
      break;
    case 'workflow':
      (acc.byKind.workflow as EventUnion[]).push(route);
      break;
    case 'forecast':
      (acc.byKind.forecast as EventUnion[]).push(route);
      break;
    case 'playbook':
      (acc.byKind.playbook as EventUnion[]).push(route);
      break;
    case 'artifact':
      (acc.byKind.artifact as EventUnion[]).push(route);
      break;
    default:
      break;
  }
  return acc;
}, {
  routes: eventCatalog,
  rows: [] as EventProfile[],
  reverse: eventTemplates,
  profiles: {} as Record<string, EventProfile>,
  byKind: {
    incident: [],
    signal: [],
    workflow: [],
    forecast: [],
    playbook: [],
    artifact: [],
  },
}) as EventMapEnvelope<typeof eventCatalog>;

export const eventCatalogLookup = <T extends EventUnion>(route: T) => {
  const profile = {
    route,
    parts: parseEvent(route),
    score: `${parseEvent(route).action}-${parseEvent(route).kind}`,
    category: eventCategoryFromString(route),
    compositeKey: `event:${route.length}:lookup`,
  };
  return { profile, template: eventTemplates[eventTemplateKey(route)] } as const;
};

export const eventTemplateMap = <T extends readonly EventUnion[]>(routes: T): EventTemplateMap<T> => {
  const out = {} as Record<string, { readonly key: string; readonly route: EventUnion; readonly path: EventUnion; readonly normalized: string; readonly priority: number }>;
  for (const route of routes) {
    const key = eventTemplateKey(route);
    out[key] = {
      key,
      route,
      path: route,
      normalized: route.toUpperCase(),
      priority: route.length,
    };
  }
  return out as EventTemplateMap<T>;
};

export const eventByKind = (routes: EventUnion[]): EventTemplateMapByKind => {
  const out = {
    incident: [],
    signal: [],
    workflow: [],
    forecast: [],
    playbook: [],
    artifact: [],
  } as EventTemplateMapByKind;
  for (const route of routes) {
    const kind = parseEvent(route).kind as EventKind;
    out[kind].push(route);
  }
  return out;
};
