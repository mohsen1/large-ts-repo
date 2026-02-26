export type DispatchVerb =
  | 'create'
  | 'notify'
  | 'query'
  | 'cancel'
  | 'reconcile'
  | 'restore'
  | 'drain'
  | 'flush'
  | 'publish'
  | 'archive'
  | 'snapshot'
  | 'audit'
  | 'synthesize'
  | 'discover'
  | 'assess';

export type DispatchDomain =
  | 'incident'
  | 'policy'
  | 'telemetry'
  | 'continuity'
  | 'chronicle'
  | 'mesh'
  | 'governance'
  | 'runtime'
  | 'orchestrator'
  | 'workflow'
  | 'command'
  | 'scheduler'
  | 'fabric'
  | 'catalog';

export type DispatchChannel =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'maintenance'
  | 'diagnostic';

export type DispatchId = `id-${string}` | `uuid-${string}` | `ref-${number}`;

export type DispatchRoute = `/${DispatchDomain}/${DispatchVerb}/${DispatchChannel}/${DispatchId}`;

export type DispatchByVerb<T extends DispatchVerb> =
  | `/${DispatchDomain}/${T}/${Extract<DispatchChannel, 'critical' | 'high'>}/${DispatchId}`
  | `/${DispatchDomain}/${T}/${Extract<DispatchChannel, 'maintenance' | 'diagnostic'>}/${DispatchId}`
  | `/${DispatchDomain}/${T}/${DispatchChannel}/${DispatchId}`;

export type DispatchUnion = DispatchByVerb<DispatchVerb> | DispatchRoute;

export type DispatchTemplate = DispatchUnion;
export type RouteTemplate = DispatchRoute;

export type DispatchRouteToken<T extends string> = T extends `/${infer Domain}/${infer Verb}/${infer Channel}:${infer Id}`
  ? never
  : T extends `/${infer Domain}/${infer Verb}/${infer Channel}/${infer Id}`
    ? `${Domain}:${Verb}:${Channel}:${Id}`
    : never;

export type RouteSignal<T extends DispatchUnion> = T extends `/${infer D}/${infer A}/${infer C}/${infer I}`
  ? {
      readonly domain: D & DispatchDomain;
      readonly verb: A & DispatchVerb;
      readonly channel: C & DispatchChannel;
      readonly id: I & DispatchId;
    }
  : never;

type Severity = 'critical' | 'elevated' | 'normal' | 'low';

export type ResolvePolicy<T extends DispatchUnion> = RouteSignal<T>['channel'] extends 'critical' | 'high'
  ? {
      readonly canRetry: true;
      readonly timeoutSec: 120;
      readonly severity: Severity;
      readonly retryWindow: `${RouteSignal<T>['channel']}:w${number}`;
    }
  : {
      readonly canRetry: false;
      readonly timeoutSec: 30;
      readonly severity: 'normal';
      readonly retryWindow: `${RouteSignal<T>['channel']}:w${number}`;
    };

export type DispatchEnvelope<T extends DispatchUnion> = {
  readonly route: T;
  readonly parsed: RouteSignal<T>;
  readonly scope: `${RouteSignal<T>['domain']}:${RouteSignal<T>['verb']}:${RouteSignal<T>['channel']}`;
  readonly trace: readonly string[];
  readonly severity: RouteSignal<T>['channel'];
  readonly traceKey: `${RouteSignal<T>['domain']}.${RouteSignal<T>['verb']}.${RouteSignal<T>['channel']}`;
};

export type DispatchResolution<T extends DispatchUnion> = DispatchEnvelope<T> & {
  readonly namespace: `${RouteSignal<T>['domain']}.atlas`;
  readonly label: `${RouteSignal<T>['channel']}-${RouteSignal<T>['verb']}`;
  readonly resolvedAt: number;
  readonly dispatchKey: string;
  readonly policy: ResolvePolicy<T>;
};

export type DispatchCatalogRecord<T extends DispatchUnion> = {
  readonly route: T;
  readonly parsed: RouteSignal<T>;
  readonly key: RouteSignal<T>['id'];
  readonly resolution: DispatchResolution<T>;
  readonly index: number;
};

export type DispatchChain<T extends DispatchUnion> = {
  readonly route: T;
  readonly sequence: readonly { readonly step: number; readonly marker: string }[];
  readonly resolved: DispatchResolution<DispatchUnion>;
  readonly accepted: boolean;
  readonly score: number;
  readonly next?: T;
};

export type DispatchCatalog = {
  readonly routes: readonly DispatchUnion[];
  readonly routesByDomain: { [K in DispatchDomain]: readonly DispatchUnion[] };
  readonly resolved: readonly DispatchUnion[];
};

export type DispatchFeed<T extends readonly DispatchUnion[]> = {
  [K in T[number]]: DispatchCatalogRecord<K>;
};

export type DispatchResult<T extends DispatchUnion = DispatchUnion> = DispatchResolution<T>;
export type DispatchResultSet<T extends readonly DispatchUnion[]> = ReadonlyArray<DispatchResult<T[number]>>;

export type DispatchCatalogByVerb<T extends DispatchVerb> = DispatchUnion extends infer U
  ? U extends DispatchUnion
    ? U extends `/${string}/${T}/${string}/${string}`
      ? U
      : never
    : never
  : never;

export type DispatchRouteMap<T extends readonly DispatchUnion[]> = {
  [K in T[number] as DispatchRouteToken<K & string>]: K;
};

export type DispatchTrace<T extends DispatchUnion> = T extends `/${infer Domain}/${infer Verb}/${infer Channel}/${infer Id}`
  ? {
      readonly parts: [Domain, Verb, Channel, Id];
      readonly fingerprint: `${Domain}:${Verb}:${Channel}:${Id}`;
    }
  : never;

export const dispatchSeeds = [
  '/incident/create/critical/id-alpha',
  '/incident/notify/medium/id-bravo',
  '/policy/assess/high/id-charlie',
  '/policy/synthesize/critical/id-delta',
  '/telemetry/query/low/id-echo',
  '/continuity/restore/critical/id-foxtrot',
  '/chronicle/archive/low/id-golf',
  '/chronicle/snapshot/diagnostic/id-hotel',
  '/mesh/flush/high/id-india',
  '/governance/audit/maintenance/id-juliet',
  '/runtime/reconcile/medium/id-kilo',
  '/orchestrator/discover/diagnostic/id-lima',
  '/workflow/assess/low/id-mike',
  '/command/cancel/low/id-oscar',
  '/scheduler/notify/high/id-papa',
  '/command/publish/high/id-quebec',
  '/runtime/drain/critical/id-romero',
  '/workflow/create/high/id-sierra',
  '/incident/query/medium/id-tango',
  '/telemetry/drain/medium/id-uniform',
  '/fabric/publish/critical/id-victor',
  '/catalog/create/diagnostic/id-whiskey',
] as const satisfies readonly DispatchUnion[];

export type BaseDispatchRoute = (typeof dispatchSeeds)[number];
export type CanonicalDispatch = BaseDispatchRoute;

export const resolveDispatchRoute = <T extends DispatchUnion>(route: T): RouteSignal<T> => {
  const [, domain, verb, channel, rawId] = route.split('/') as [string, DispatchDomain, DispatchVerb, DispatchChannel, string];
  return {
    domain,
    verb,
    channel,
    id: rawId as DispatchId,
  } as RouteSignal<T>;
};

export const resolveDispatchPolicy = <T extends DispatchUnion>(route: T): ResolvePolicy<T> => {
  const parsed = resolveDispatchRoute(route);
  const timeoutSec = parsed.channel === 'critical' ? 120 : parsed.channel === 'high' ? 90 : parsed.channel === 'medium' ? 60 : 30;
  return {
    canRetry: parsed.channel === 'critical' || parsed.channel === 'high',
    timeoutSec,
    severity: parsed.channel === 'critical' ? 'critical' : parsed.channel === 'high' ? 'elevated' : 'normal',
    retryWindow: `${parsed.channel}:w${timeoutSec / 30}`,
  } as ResolvePolicy<T>;
};

const buildRecord = <T extends DispatchUnion>(route: T, index: number): DispatchCatalogRecord<T> => {
  const parsed = resolveDispatchRoute(route);
  const policy = resolveDispatchPolicy(route);
  return {
    route,
    parsed,
    key: parsed.id,
    index,
    resolution: {
      route,
      parsed,
      scope: `${parsed.domain}:${parsed.verb}:${parsed.channel}`,
      trace: ['/recovery', route],
      severity: parsed.channel,
      traceKey: `${parsed.domain}.${parsed.verb}.${parsed.channel}`,
      namespace: `${parsed.domain}.atlas`,
      label: `${parsed.channel}-${parsed.verb}`,
      resolvedAt: 1000 + index,
      dispatchKey: `${parsed.domain}::${parsed.verb}::${parsed.id}`,
      policy: {
        ...policy,
        retryWindow: `${parsed.channel}:w${index + 1}`,
      },
    } as DispatchResolution<T>,
  };
};

export const dispatchCatalog = <T extends readonly DispatchUnion[]>(routes: T): DispatchFeed<T> => {
  const payload: Partial<Record<T[number], DispatchCatalogRecord<T[number]>>> = {};
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index] as T[number];
    payload[route] = buildRecord(route, index);
  }
  return payload as DispatchFeed<T>;
};

export const buildDispatchChains = <T extends readonly DispatchUnion[]>(routes: T): readonly DispatchChain<T[number]>[] => {
  return routes.map((route, index) => {
    const parsed = resolveDispatchRoute(route);
    const policy = resolveDispatchPolicy(route);
    return {
      route,
      sequence: [
        { step: 0, marker: `${parsed.domain}:${parsed.channel}` },
        { step: 1, marker: `${parsed.verb}:${parsed.id}` },
      ],
      resolved: buildRecord(route, index).resolution,
      accepted: policy.canRetry,
      score: (index + parsed.id.length) % 100,
      next: routes[index + 1],
    };
  }) as readonly DispatchChain<T[number]>[];
};

export const buildDispatchIndex = <T extends readonly DispatchUnion[]>(routes: T): DispatchRouteMap<T> => {
  const output = {} as DispatchRouteMap<T>;
  for (const route of routes) {
    const parsed = resolveDispatchRoute(route);
    const key = `${parsed.domain}:${parsed.verb}:${parsed.channel}:${parsed.id}` as DispatchRouteToken<DispatchUnion>;
    (output as Record<string, DispatchUnion>)[key] = route;
  }
  return output;
};

export type ResolveDispatch<T extends DispatchUnion> = DispatchResolution<T>;
