export type WorkDomain =
  | 'auth'
  | 'billing'
  | 'catalog'
  | 'continuity'
  | 'dashboard'
  | 'discovery'
  | 'edge'
  | 'fleet'
  | 'fulfillment'
  | 'governance'
  | 'incident'
  | 'intake'
  | 'inventory'
  | 'lattice'
  | 'ops'
  | 'orchestrator'
  | 'policy'
  | 'quantum'
  | 'recovery'
  | 'risk'
  | 'signal';

export type WorkAction =
  | 'assess'
  | 'archive'
  | 'assemble'
  | 'audit'
  | 'authorize'
  | 'cancel'
  | 'checkpoint'
  | 'classify'
  | 'compose'
  | 'connect'
  | 'dispatch'
  | 'discover'
  | 'drain'
  | 'escalate'
  | 'notify'
  | 'observe'
  | 'patch'
  | 'queue'
  | 'reconcile'
  | 'recover'
  | 'release'
  | 'repair'
  | 'route'
  | 'safeguard'
  | 'seal'
  | 'simulate'
  | 'suspend'
  | 'verify';

export type SeverityToken =
  | 'advisory'
  | 'critical'
  | 'degraded'
  | 'emergency'
  | 'high'
  | 'informational'
  | 'low'
  | 'normal'
  | 'notice'
  | 'severe';

export type RouteTemplate<
  TDomain extends WorkDomain = WorkDomain,
  TAction extends WorkAction = WorkAction,
  TId extends string = string,
  TSeverity extends SeverityToken = SeverityToken,
> = `/${TDomain}/${TAction}/${TId}/${TSeverity}`;

export type RouteDiscriminatorUnion = RouteTemplate;

export type WorkRoute = string;

export interface WorkRouteParts<T extends WorkRoute = WorkRoute> {
  readonly domain: WorkDomain;
  readonly action: WorkAction;
  readonly id: string;
  readonly severity: SeverityToken;
  readonly raw: T;
}

export type ActionPriority<A extends WorkAction> = A extends 'discover'
  ? 1
  : A extends 'assess'
    ? 2
    : A extends 'route'
      ? 3
      : A extends 'recover'
        ? 4
        : A extends 'repair'
          ? 5
          : 6;

export type SeverityWeight<S extends SeverityToken> = S extends 'critical'
  ? 9
  : S extends 'emergency'
    ? 8
    : S extends 'high'
      ? 6
      : S extends 'severe'
        ? 7
        : S extends 'degraded'
          ? 4
          : 2;

export type RoutePhase =
  | 'analysis'
  | 'triage'
  | 'dispatch'
  | 'remediate'
  | 'repair'
  | 'notify'
  | 'simulate'
  | 'verify'
  | 'release'
  | 'archive'
  | 'execute';

export type RouteDecision<T extends WorkRoute = WorkRoute> = {
  readonly route: T;
  readonly parts: WorkRouteParts<T>;
  readonly phase: RoutePhase;
  readonly score: ActionPriority<WorkAction>;
  readonly weight: SeverityWeight<SeverityToken>;
};

export type RouteDiscrimination<T extends WorkRoute> = RouteDecision<T>;

export type RouteTemplateSignature<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends string ? T[K] : never;
};

export type RouteTemplateMap<T extends readonly WorkRoute[]> = { [K in keyof T]: RouteDecision<T[K]> };

export type RouteTemplateBucket<T extends readonly WorkRoute[]> = {
  readonly routes: readonly [...T];
  readonly decisions: ReadonlyArray<RouteDiscrimination<T[number]>>;
};

export const seedCatalog = [
  '/recovery/discover/incident-1/critical',
  '/recovery/assess/incident-2/high',
  '/incident/route/incident-3/severe',
  '/incident/recover/incident-4/emergency',
  '/policy/notify/policy-5/informational',
  '/policy/reconcile/policy-6/low',
  '/risk/queue/risk-7/degraded',
  '/signal/notify/signal-8/normal',
  '/ops/verify/check-9/notice',
  '/orchestrator/simulate/cycle-10/advisory',
  '/auth/release/user-12/high',
  '/lattice/compose/slice-13/informational',
  '/continuity/checkpoint/segment-14/high',
  '/edge/dispatch/edge-15/severe',
  '/fleet/suspend/fleet-16/critical',
  '/dashboard/archive/snap-17/notice',
  '/catalog/patch/cat-18/high',
  '/billing/repair/item-19/degraded',
  '/discovery/classify/entity-20/normal',
  '/discovery/compose/entity-21/high',
] as const;

export type SeedRouteUnion = (typeof seedCatalog)[number];
export type SeedRouteProfile = RouteTemplateBucket<typeof seedCatalog>;

export const routeCatalog = [...seedCatalog] as readonly WorkRoute[];

const phaseByAction: Record<WorkAction, RoutePhase> = {
  assess: 'triage',
  archive: 'archive',
  assemble: 'dispatch',
  audit: 'verify',
  authorize: 'verify',
  cancel: 'verify',
  checkpoint: 'analysis',
  classify: 'analysis',
  compose: 'dispatch',
  connect: 'dispatch',
  dispatch: 'dispatch',
  discover: 'analysis',
  drain: 'remediate',
  escalate: 'triage',
  notify: 'notify',
  observe: 'verify',
  patch: 'repair',
  queue: 'verify',
  reconcile: 'repair',
  recover: 'remediate',
  release: 'release',
  repair: 'repair',
  route: 'dispatch',
  safeguard: 'execute',
  seal: 'archive',
  simulate: 'simulate',
  suspend: 'remediate',
  verify: 'verify',
};

export const buildRouteProfile = <T extends WorkRoute>(route: T): RouteTemplateMap<readonly [T]> => {
  const parts = route.split('/') as [string, WorkDomain, WorkAction, string, SeverityToken];
  const decision: RouteDecision<T> = {
    route,
    parts: {
      domain: parts[1] ?? 'recovery',
      action: parts[2] ?? 'notify',
      id: parts[3] ?? 'id',
      severity: parts[4] ?? 'low',
      raw: route,
    },
    phase: phaseByAction[parts[2] ?? 'notify'],
    score: 5 as ActionPriority<WorkAction>,
    weight: 2 as SeverityWeight<SeverityToken>,
  };

  return [decision] as RouteTemplateMap<readonly [T]>;
};

export const compileRouteTemplate = <T extends readonly WorkRoute[]>(routes: T): RouteTemplateBucket<T> => {
  const decisions = routes.map((route) => buildRouteProfile(route)[0] as unknown as RouteDiscrimination<T[number]>);
  return {
    routes: routes,
    decisions,
  };
};

export const mapCatalog = new Map<string, WorkRoute>(routeCatalog.map((route, index) => [`${route}:${index}`, route]));

export const routeDecisions = compileRouteTemplate(routeCatalog);
