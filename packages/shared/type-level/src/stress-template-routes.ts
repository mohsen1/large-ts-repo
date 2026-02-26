export type TemplateDomain =
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
  | 'observer'
  | 'orchestrator'
  | 'playbook'
  | 'policy'
  | 'planner'
  | 'recovery';

export type TemplateAction =
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
  | 'policy-reset'
  | 'resource-scan'
  | 'state-rollback'
  | 'node-throttle'
  | 'policy-rewrite'
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
  | 'audit-trace';

export type TemplateStatus = 'new' | 'in-flight' | 'done' | 'failed' | 'retired' | 'archived';
export type TemplateId = `rid-${string}` | `uuid-${string}` | 'latest';
export type TemplatePath = `/${TemplateDomain}/${TemplateAction}/${TemplateStatus}/${TemplateId}`;

export type ParseTemplateRoute<T extends string> = T extends `/${infer D}/${infer A}/${infer S}/${infer I}`
  ? {
      readonly domain: D & TemplateDomain;
      readonly action: A & TemplateAction;
      readonly status: S & TemplateStatus;
      readonly id: I & TemplateId;
      readonly normalized: `${Uppercase<D & TemplateDomain>}/${Uppercase<A & TemplateAction>}`;
    }
  : never;

export type TemplateMap<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T & string as `route:${K}`]: T[K];
};

export type TemplateLookupByStatus<TStatus extends TemplateStatus, TMap extends Record<string, { readonly path: string }>> = {
  [K in keyof TMap]: TMap[K] extends { readonly path: TemplatePath }
    ? TMap[K]['path'] extends `/${string}/${string}/${TStatus}/${string}`
      ? TMap[K]
      : never
    : never;
}[keyof TMap];

export type TemplateRouteTuple<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends TemplatePath ? ParseTemplateRoute<T[K]> : never;
};

export function parseTemplateRoute<T extends string>(route: T): ParseTemplateRoute<T> {
  const parts = route.split('/').filter(Boolean);
  const [domain, action, status, id] = parts;
  return {
    domain: domain as TemplateDomain,
    action: action as TemplateAction,
    status: status as TemplateStatus,
    id: (id as TemplateId) ?? ('latest' as TemplateId),
    normalized: `${(domain ?? 'recovery').toUpperCase()}/${(action ?? 'recover').toUpperCase()}` as `${string}/${string}`,
  } as ParseTemplateRoute<T>;
}

export const templateRouteCatalog = {
  recover: { path: '/recovery/recover/done/rid-1' as const, owner: 'ops', enabled: true },
  ingest: { path: '/recovery/ingest/in-flight/uuid-11' as const, owner: 'ops', enabled: true },
  audit: { path: '/telemetry/audit/new/rid-55' as const, owner: 'sec', enabled: false },
  dispatch: { path: '/policy/dispatch/failed/uuid-89' as const, owner: 'policy', enabled: false },
} satisfies Record<string, { readonly path: string; readonly owner: string; readonly enabled: boolean }>;

export type RouteRecordMap = typeof templateRouteCatalog;
export type RoutedPayload<T extends Record<string, { readonly path: string; readonly owner: string; readonly enabled: boolean }>> = {
  [K in keyof T as `${K & string}-route`]: {
    readonly source: K;
    readonly sourceName: K & string;
    readonly route: ParseTemplateRoute<T[K]['path']>;
  };
};

export type TemplateRouteParsedUnion = TemplateRouteTuple<
  ['/recovery/recover/done/rid-1', '/recovery/ingest/in-flight/uuid-11', '/telemetry/audit/new/rid-55']
>;

export const templateRouteUnion = [
  templateRouteCatalog.recover.path,
  templateRouteCatalog.ingest.path,
  templateRouteCatalog.audit.path,
  templateRouteCatalog.dispatch.path,
] as const;

export type RouteParsedByStatus = TemplateLookupByStatus<'in-flight', RouteRecordMap>;
export type RouteMapPayload = RoutedPayload<RouteRecordMap>;

export type RouteSuffix<T extends string> = T extends `/${string}/${string}/${infer Rest}` ? Rest : never;
export type RouteValue<T extends string> = T extends `${string}-${infer S}` ? S : never;

type TemplateRouteEntryMap<T extends readonly string[]> = {
  [K in T[number]]: ParseTemplateRoute<K>;
};

type TemplateRouteValueUnion = typeof templateRouteUnion[number];
type TemplateRouteEntryRecord = { [K in TemplateRouteValueUnion]: ParseTemplateRoute<K> };
export const templateRouteEntries = {
  [templateRouteUnion[0]]: parseTemplateRoute(templateRouteUnion[0]),
  [templateRouteUnion[1]]: parseTemplateRoute(templateRouteUnion[1]),
  [templateRouteUnion[2]]: parseTemplateRoute(templateRouteUnion[2]),
  [templateRouteUnion[3]]: parseTemplateRoute(templateRouteUnion[3]),
} as TemplateRouteEntryRecord;

export const routeTemplatePayload = <K extends keyof RouteRecordMap & string>(
  route: RouteRecordMap[K]['path'],
  owner: K,
): RouteMapPayload[`${K}-route`] => {
  const parsed = parseTemplateRoute(route as TemplatePath);
  return {
    source: owner,
    sourceName: owner,
    route: parsed,
  } as RouteMapPayload[`${K}-route`];
};

export const nestedMappedTemplate = <T extends Record<string, Record<string, TemplatePath>>>(
  catalog: T,
): { [A in keyof T]: { [B in keyof T[A] as `${string & B}_${A & string}`]: ParseTemplateRoute<T[A][B]> } } => {
  return catalog as unknown as { [A in keyof T]: { [B in keyof T[A] as `${string & B}_${A & string}`]: ParseTemplateRoute<T[A][B]> } };
};
