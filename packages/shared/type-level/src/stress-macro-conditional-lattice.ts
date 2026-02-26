export type MacroEntity =
  | 'incident'
  | 'workload'
  | 'timeline'
  | 'policy'
  | 'fabric'
  | 'forecast'
  | 'signal'
  | 'mesh'
  | 'registry'
  | 'orchestrator'
  | 'controller'
  | 'resolver'
  | 'observer'
  | 'auditor'
  | 'planner'
  | 'dispatcher'
  | 'ingest'
  | 'archive'
  | 'runner'
  | 'validator'
  | 'scheduler'
  | 'dispatcher-v2'
  | 'runtime'
  | 'telemetry'
  | 'saga'
  | 'inventory'
  | 'inventory-audit'
  | 'playbook'
  | 'lab'
  | 'coordinator'
  | 'observer-v2'
  | 'governor'
  | 'navigator'
  | 'strategy'
  | 'intelligence'
  | 'fabric-mesh'
  | 'command'
  | 'workflow'
  | 'risk'
  | 'stability'
  | 'continuity';

export type MacroAction =
  | 'discover'
  | 'assess'
  | 'dispatch'
  | 'stabilize'
  | 'rollback'
  | 'observe'
  | 'plan'
  | 'simulate'
  | 'audit'
  | 'reconcile'
  | 'migrate'
  | 'throttle'
  | 'escalate'
  | 'de-escalate'
  | 'synchronize'
  | 'materialize';

export type MacroSeverity = 'low' | 'medium' | 'high' | 'critical' | 'urgent' | 'maintenance';

export type MacroRoute = `/${MacroEntity}/${MacroAction}/${MacroSeverity}/${string}`;

export type ResolveEntityLevel<T extends MacroEntity> =
  T extends 'incident'
    ? { readonly kind: 'incident'; readonly layer: 1; readonly domain: 'operations' }
    : T extends 'workload'
      ? { readonly kind: 'workload'; readonly layer: 2; readonly domain: 'capacity' }
      : T extends 'timeline'
        ? { readonly kind: 'timeline'; readonly layer: 3; readonly domain: 'history' }
        : T extends 'policy'
          ? { readonly kind: 'policy'; readonly layer: 4; readonly domain: 'governance' }
          : T extends 'fabric'
            ? { readonly kind: 'fabric'; readonly layer: 5; readonly domain: 'structure' }
            : T extends 'forecast'
              ? { readonly kind: 'forecast'; readonly layer: 6; readonly domain: 'prediction' }
              : T extends 'signal'
                ? { readonly kind: 'signal'; readonly layer: 7; readonly domain: 'telemetry' }
                : T extends 'mesh'
                  ? { readonly kind: 'mesh'; readonly layer: 8; readonly domain: 'network' }
                  : T extends 'registry'
                    ? { readonly kind: 'registry'; readonly layer: 9; readonly domain: 'catalog' }
                    : T extends 'orchestrator'
                      ? { readonly kind: 'orchestrator'; readonly layer: 10; readonly domain: 'orchestration' }
                      : T extends 'controller'
                        ? { readonly kind: 'controller'; readonly layer: 11; readonly domain: 'control' }
                        : T extends 'resolver'
                          ? { readonly kind: 'resolver'; readonly layer: 12; readonly domain: 'analysis' }
                          : T extends 'observer'
                            ? { readonly kind: 'observer'; readonly layer: 13; readonly domain: 'monitoring' }
                            : T extends 'auditor'
                              ? { readonly kind: 'auditor'; readonly layer: 14; readonly domain: 'compliance' }
                              : T extends 'planner'
                                ? { readonly kind: 'planner'; readonly layer: 15; readonly domain: 'scheduling' }
                                : T extends 'dispatcher'
                                  ? { readonly kind: 'dispatcher'; readonly layer: 16; readonly domain: 'routing' }
                                  : T extends 'ingest'
                                    ? { readonly kind: 'ingest'; readonly layer: 17; readonly domain: 'pipeline' }
                                    : T extends 'archive'
                                      ? { readonly kind: 'archive'; readonly layer: 18; readonly domain: 'storage' }
                                      : T extends 'runner'
                                        ? { readonly kind: 'runner'; readonly layer: 19; readonly domain: 'execution' }
                                        : T extends 'validator'
                                          ? { readonly kind: 'validator'; readonly layer: 20; readonly domain: 'quality' }
                                          : T extends 'scheduler'
                                            ? { readonly kind: 'scheduler'; readonly layer: 21; readonly domain: 'planning' }
                                            : T extends 'dispatcher-v2'
                                              ? { readonly kind: 'dispatcher-v2'; readonly layer: 22; readonly domain: 'routing' }
                                              : T extends 'runtime'
                                                ? { readonly kind: 'runtime'; readonly layer: 23; readonly domain: 'services' }
                                                : T extends 'telemetry'
                                                  ? { readonly kind: 'telemetry'; readonly layer: 24; readonly domain: 'sensing' }
                                                  : T extends 'saga'
                                                    ? { readonly kind: 'saga'; readonly layer: 25; readonly domain: 'transitions' }
                                                    : T extends 'inventory'
                                                      ? { readonly kind: 'inventory'; readonly layer: 26; readonly domain: 'assets' }
                                                      : T extends 'inventory-audit'
                                                        ? { readonly kind: 'inventory-audit'; readonly layer: 27; readonly domain: 'assets' }
                                                        : T extends 'playbook'
                                                          ? { readonly kind: 'playbook'; readonly layer: 28; readonly domain: 'procedures' }
                                                          : T extends 'lab'
                                                            ? { readonly kind: 'lab'; readonly layer: 29; readonly domain: 'experiments' }
                                                            : T extends 'coordinator'
                                                              ? { readonly kind: 'coordinator'; readonly layer: 30; readonly domain: 'coordination' }
                                                              : T extends 'observer-v2'
                                                                ? { readonly kind: 'observer-v2'; readonly layer: 31; readonly domain: 'monitoring' }
                                                                : T extends 'governor'
                                                                  ? { readonly kind: 'governor'; readonly layer: 32; readonly domain: 'governance' }
                                                                  : T extends 'navigator'
                                                                    ? { readonly kind: 'navigator'; readonly layer: 33; readonly domain: 'guidance' }
                                                                    : T extends 'strategy'
                                                                      ? { readonly kind: 'strategy'; readonly layer: 34; readonly domain: 'planning' }
                                                                      : T extends 'intelligence'
                                                                        ? { readonly kind: 'intelligence'; readonly layer: 35; readonly domain: 'analysis' }
                                                                        : T extends 'fabric-mesh'
                                                                          ? { readonly kind: 'fabric-mesh'; readonly layer: 36; readonly domain: 'network' }
                                                                          : T extends 'command'
                                                                            ? { readonly kind: 'command'; readonly layer: 37; readonly domain: 'execution' }
                                                                            : T extends 'workflow'
                                                                              ? { readonly kind: 'workflow'; readonly layer: 38; readonly domain: 'process' }
                                                                              : T extends 'risk'
                                                                                ? { readonly kind: 'risk'; readonly layer: 39; readonly domain: 'governance' }
                                                                                : T extends 'stability'
                                                                                  ? { readonly kind: 'stability'; readonly layer: 40; readonly domain: 'resilience' }
                                                                                  : { readonly kind: 'continuity'; readonly layer: 41; readonly domain: 'operations' };

export type ResolveAction<T extends MacroAction> =
  T extends 'discover'
    ? { readonly mode: 'discover'; readonly requiresDiscovery: true; readonly sensitivity: 1 }
    : T extends 'assess'
      ? { readonly mode: 'assess'; readonly requiresDiscovery: false; readonly sensitivity: 2 }
      : T extends 'dispatch'
        ? { readonly mode: 'dispatch'; readonly requiresDiscovery: false; readonly sensitivity: 3 }
        : T extends 'stabilize'
          ? { readonly mode: 'stabilize'; readonly requiresDiscovery: false; readonly sensitivity: 4 }
          : T extends 'rollback'
            ? { readonly mode: 'rollback'; readonly requiresDiscovery: false; readonly sensitivity: 5 }
            : T extends 'observe'
              ? { readonly mode: 'observe'; readonly requiresDiscovery: false; readonly sensitivity: 1 }
              : T extends 'plan'
                ? { readonly mode: 'plan'; readonly requiresDiscovery: false; readonly sensitivity: 3 }
                : T extends 'simulate'
                  ? { readonly mode: 'simulate'; readonly requiresDiscovery: true; readonly sensitivity: 2 }
                  : T extends 'audit'
                    ? { readonly mode: 'audit'; readonly requiresDiscovery: true; readonly sensitivity: 4 }
                    : T extends 'reconcile'
                      ? { readonly mode: 'reconcile'; readonly requiresDiscovery: true; readonly sensitivity: 5 }
                      : T extends 'migrate'
                        ? { readonly mode: 'migrate'; readonly requiresDiscovery: false; readonly sensitivity: 5 }
                        : T extends 'throttle'
                          ? { readonly mode: 'throttle'; readonly requiresDiscovery: false; readonly sensitivity: 4 }
                          : T extends 'escalate'
                            ? { readonly mode: 'escalate'; readonly requiresDiscovery: true; readonly sensitivity: 5 }
                            : T extends 'de-escalate'
                              ? { readonly mode: 'de-escalate'; readonly requiresDiscovery: true; readonly sensitivity: 2 }
                              : T extends 'synchronize'
                                ? { readonly mode: 'synchronize'; readonly requiresDiscovery: false; readonly sensitivity: 3 }
                                : { readonly mode: 'materialize'; readonly requiresDiscovery: false; readonly sensitivity: 1 };

export type ResolveSeverity<T extends MacroSeverity> =
  T extends 'critical'
    ? { readonly impact: 'catastrophic'; readonly canPause: false; readonly timeoutMinutes: 60 }
    : T extends 'urgent'
      ? { readonly impact: 'urgent'; readonly canPause: false; readonly timeoutMinutes: 30 }
      : T extends 'high'
        ? { readonly impact: 'high'; readonly canPause: true; readonly timeoutMinutes: 20 }
        : T extends 'medium'
          ? { readonly impact: 'medium'; readonly canPause: true; readonly timeoutMinutes: 10 }
          : T extends 'maintenance'
            ? { readonly impact: 'maintenance'; readonly canPause: true; readonly timeoutMinutes: 5 }
            : { readonly impact: 'low'; readonly canPause: true; readonly timeoutMinutes: 3 };

export type ParsedMacroRoute<T extends MacroRoute> = T extends `/${infer E}/${infer A}/${infer S}/${infer Id}`
  ? E extends MacroEntity
    ? A extends MacroAction
      ? S extends MacroSeverity
        ? {
            readonly entity: ResolveEntityLevel<E>;
            readonly action: ResolveAction<A>;
            readonly severity: ResolveSeverity<S>;
            readonly id: Id;
          }
        : never
      : never
    : never
  : never;

export type RouteChainOutcome<T extends MacroRoute> = {
  readonly fingerprint: `${string}`;
  readonly routePath: `/cmd/${number}`;
  readonly id: string;
  readonly canPause: boolean;
  readonly timeout: number;
  readonly severity: number;
  readonly policy: string;
};

export type ResolveRouteChain<T extends MacroRoute> = T extends any ? RouteChainOutcome<T> : never;
export type MacroRouteMap<T extends readonly MacroRoute[]> = {
  readonly [K in keyof T as T[K] & string]: ResolveRouteChain<T[K] & MacroRoute>;
};

export type RouteEnvelope<T extends MacroRoute> = {
  readonly raw: T;
  readonly parsed: ParsedMacroRoute<T>;
  readonly chain: RouteChainOutcome<T>;
};

export const macroRoutes = [
  '/incident/discover/high/R101',
  '/workload/assess/medium/W209',
  '/timeline/simulate/low/T001',
  '/policy/rollback/critical/P777',
  '/fabric/plan/maintenance/F900',
  '/forecast/synchronize/medium/FM201',
  '/signal/audit/high/S301',
  '/mesh/reconcile/low/M111',
  '/orchestrator/materialize/urgent/O990',
  '/controller/assess/high/C001',
] as const satisfies readonly MacroRoute[];

export type MacroRouteCatalog = MacroRouteMap<typeof macroRoutes>;

export const resolveMacroRoutes = (): ReadonlyArray<RouteEnvelope<MacroRoute>> => {
  const list = macroRoutes as ReadonlyArray<MacroRoute>;
  return list.map((route) => ({
    raw: route,
    parsed: parseMacroRoute(route),
    chain: resolveRouteChain(route),
  }));
};

export const parseMacroRoute = <T extends MacroRoute>(route: T): ParsedMacroRoute<T> => {
  const [, entity, action, severity, id] = route.split('/') as [string, MacroEntity, MacroAction, MacroSeverity, string];

  return {
    entity: resolveEntityLevel(entity),
    action: resolveAction(action),
    severity: resolveSeverity(severity),
    id,
  } as ParsedMacroRoute<T>;
};

export const resolveRouteChain = <T extends MacroRoute>(route: T): RouteChainOutcome<T> => {
  const parsed = parseMacroRoute(route);
  const { entity, action, severity } = parsed;
  return {
    fingerprint: `${String(entity.domain)}:${String(action.mode)}:${severity.impact}`,
    routePath: `/cmd/${entity.layer}`,
    id: parsed.id,
    canPause: severity.canPause,
    timeout: severity.timeoutMinutes,
    severity: Number(action.sensitivity),
    policy: String(action.mode),
  };
};

const resolveEntityLevel = <T extends MacroEntity>(value: T): ResolveEntityLevel<T> => {
  const levels: Record<MacroEntity, ResolveEntityLevel<MacroEntity>> = {
    incident: { kind: 'incident', layer: 1, domain: 'operations' },
    workload: { kind: 'workload', layer: 2, domain: 'capacity' },
    timeline: { kind: 'timeline', layer: 3, domain: 'history' },
    policy: { kind: 'policy', layer: 4, domain: 'governance' },
    fabric: { kind: 'fabric', layer: 5, domain: 'structure' },
    forecast: { kind: 'forecast', layer: 6, domain: 'prediction' },
    signal: { kind: 'signal', layer: 7, domain: 'telemetry' },
    mesh: { kind: 'mesh', layer: 8, domain: 'network' },
    registry: { kind: 'registry', layer: 9, domain: 'catalog' },
    orchestrator: { kind: 'orchestrator', layer: 10, domain: 'orchestration' },
    controller: { kind: 'controller', layer: 11, domain: 'control' },
    resolver: { kind: 'resolver', layer: 12, domain: 'analysis' },
    observer: { kind: 'observer', layer: 13, domain: 'monitoring' },
    auditor: { kind: 'auditor', layer: 14, domain: 'compliance' },
    planner: { kind: 'planner', layer: 15, domain: 'scheduling' },
    dispatcher: { kind: 'dispatcher', layer: 16, domain: 'routing' },
    ingest: { kind: 'ingest', layer: 17, domain: 'pipeline' },
    archive: { kind: 'archive', layer: 18, domain: 'storage' },
    runner: { kind: 'runner', layer: 19, domain: 'execution' },
    validator: { kind: 'validator', layer: 20, domain: 'quality' },
    scheduler: { kind: 'scheduler', layer: 21, domain: 'planning' },
    'dispatcher-v2': { kind: 'dispatcher-v2', layer: 22, domain: 'routing' },
    runtime: { kind: 'runtime', layer: 23, domain: 'services' },
    telemetry: { kind: 'telemetry', layer: 24, domain: 'sensing' },
    saga: { kind: 'saga', layer: 25, domain: 'transitions' },
    inventory: { kind: 'inventory', layer: 26, domain: 'assets' },
    'inventory-audit': { kind: 'inventory-audit', layer: 27, domain: 'assets' },
    playbook: { kind: 'playbook', layer: 28, domain: 'procedures' },
    lab: { kind: 'lab', layer: 29, domain: 'experiments' },
    coordinator: { kind: 'coordinator', layer: 30, domain: 'coordination' },
    'observer-v2': { kind: 'observer-v2', layer: 31, domain: 'monitoring' },
    governor: { kind: 'governor', layer: 32, domain: 'governance' },
    navigator: { kind: 'navigator', layer: 33, domain: 'guidance' },
    strategy: { kind: 'strategy', layer: 34, domain: 'planning' },
    intelligence: { kind: 'intelligence', layer: 35, domain: 'analysis' },
    'fabric-mesh': { kind: 'fabric-mesh', layer: 36, domain: 'network' },
    command: { kind: 'command', layer: 37, domain: 'execution' },
    workflow: { kind: 'workflow', layer: 38, domain: 'process' },
    risk: { kind: 'risk', layer: 39, domain: 'governance' },
    stability: { kind: 'stability', layer: 40, domain: 'resilience' },
    continuity: { kind: 'continuity', layer: 41, domain: 'operations' },
  };
  return levels[value] as ResolveEntityLevel<T>;
};

const resolveAction = <T extends MacroAction>(value: T): ResolveAction<T> => {
  const actionMap: Record<MacroAction, ResolveAction<MacroAction>> = {
    discover: { mode: 'discover', requiresDiscovery: true, sensitivity: 1 },
    assess: { mode: 'assess', requiresDiscovery: false, sensitivity: 2 },
    dispatch: { mode: 'dispatch', requiresDiscovery: false, sensitivity: 3 },
    stabilize: { mode: 'stabilize', requiresDiscovery: false, sensitivity: 4 },
    rollback: { mode: 'rollback', requiresDiscovery: false, sensitivity: 5 },
    observe: { mode: 'observe', requiresDiscovery: false, sensitivity: 1 },
    plan: { mode: 'plan', requiresDiscovery: false, sensitivity: 3 },
    simulate: { mode: 'simulate', requiresDiscovery: true, sensitivity: 2 },
    audit: { mode: 'audit', requiresDiscovery: true, sensitivity: 4 },
    reconcile: { mode: 'reconcile', requiresDiscovery: true, sensitivity: 5 },
    migrate: { mode: 'migrate', requiresDiscovery: false, sensitivity: 5 },
    throttle: { mode: 'throttle', requiresDiscovery: false, sensitivity: 4 },
    escalate: { mode: 'escalate', requiresDiscovery: true, sensitivity: 5 },
    'de-escalate': { mode: 'de-escalate', requiresDiscovery: true, sensitivity: 2 },
    synchronize: { mode: 'synchronize', requiresDiscovery: false, sensitivity: 3 },
    materialize: { mode: 'materialize', requiresDiscovery: false, sensitivity: 1 },
  };
  return actionMap[value] as ResolveAction<T>;
};

const resolveSeverity = <T extends MacroSeverity>(value: T): ResolveSeverity<T> => {
  const severityMap: Record<MacroSeverity, ResolveSeverity<MacroSeverity>> = {
    low: { impact: 'low', canPause: true, timeoutMinutes: 3 },
    medium: { impact: 'medium', canPause: true, timeoutMinutes: 10 },
    high: { impact: 'high', canPause: true, timeoutMinutes: 20 },
    critical: { impact: 'catastrophic', canPause: false, timeoutMinutes: 60 },
    urgent: { impact: 'urgent', canPause: false, timeoutMinutes: 30 },
    maintenance: { impact: 'maintenance', canPause: true, timeoutMinutes: 5 },
  };
  return severityMap[value] as ResolveSeverity<T>;
};
