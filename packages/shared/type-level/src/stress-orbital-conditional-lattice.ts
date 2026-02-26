import { Brand } from './patterns';

export type OrbitalDomain =
  | 'atlas'
  | 'continuity'
  | 'chronicle'
  | 'command'
  | 'control'
  | 'crypto'
  | 'delivery'
  | 'drill'
  | 'fabric'
  | 'forecast'
  | 'governance'
  | 'incident'
  | 'intelligence'
  | 'lineage'
  | 'lifecycle'
  | 'lattice'
  | 'mesh'
  | 'observer'
  | 'ops'
  | 'orchestrator'
  | 'policy'
  | 'playbook'
  | 'portfolio'
  | 'quantum'
  | 'risk'
  | 'scenario'
  | 'signal'
  | 'saga'
  | 'stability'
  | 'storage'
  | 'strategy'
  | 'telemetry'
  | 'timeline'
  | 'vault'
  | 'workflow';

export type OrbitalAction =
  | 'bootstrap'
  | 'admit'
  | 'adopt'
  | 'discover'
  | 'align'
  | 'annotate'
  | 'audit'
  | 'authorize'
  | 'broadcast'
  | 'coordinate'
  | 'compose'
  | 'connect'
  | 'consult'
  | 'debug'
  | 'deploy'
  | 'derive'
  | 'dispatch'
  | 'emit'
  | 'evaluate'
  | 'execute'
  | 'explore'
  | 'fabricate'
  | 'forecast'
  | 'fortify'
  | 'gather'
  | 'govern'
  | 'observe'
  | 'orchestrate'
  | 'profile'
  | 'query'
  | 'route'
  | 'simulate'
  | 'stabilize'
  | 'synchronize'
  | 'validate'
  | 'verify';

export type OrbitalPhase = 'init' | 'probe' | 'steady' | 'drain' | 'repair' | 'audit' | 'finalize';
export type OrbitalResource = 'agent' | 'catalog' | 'graph' | 'policy' | 'signal' | 'timeline' | 'vault' | 'domain';

export type OrbitalRoute = `/${string}/${string}/${string}/${string}`;
export type RouteUnion = typeof orbitalRoutes[number];

export interface RouteEnvelope<TDomain extends OrbitalDomain, TAction extends OrbitalAction, TPhase extends OrbitalPhase, TResource extends OrbitalResource> {
  readonly routeId: Brand<string, 'orbital-route-id'>;
  readonly domain: TDomain;
  readonly action: TAction;
  readonly phase: TPhase;
  readonly resource: TResource;
  readonly weight: number;
  readonly criticality: 'low' | 'medium' | 'high' | 'critical';
}

type DomainProfile<T extends OrbitalDomain> = T extends 'atlas'
  ? { readonly scope: 'catalog'; readonly priority: 10; readonly tier: 'discovery' }
  : T extends 'continuity'
    ? { readonly scope: 'durability'; readonly priority: 20; readonly tier: 'durable' }
    : T extends 'chronicle'
      ? { readonly scope: 'history'; readonly priority: 21; readonly tier: 'memory' }
      : T extends 'command'
        ? { readonly scope: 'actuation'; readonly priority: 30; readonly tier: 'control' }
        : T extends 'control'
          ? { readonly scope: 'policy'; readonly priority: 40; readonly tier: 'governance' }
          : T extends 'crypto'
            ? { readonly scope: 'security'; readonly priority: 50; readonly tier: 'security' }
            : T extends 'delivery'
              ? { readonly scope: 'release'; readonly priority: 60; readonly tier: 'operations' }
              : T extends 'drill'
                ? { readonly scope: 'preparedness'; readonly priority: 70; readonly tier: 'resilience' }
                : T extends 'fabric'
                  ? { readonly scope: 'topology'; readonly priority: 80; readonly tier: 'mesh' }
                  : T extends 'forecast'
                    ? { readonly scope: 'intelligence'; readonly priority: 90; readonly tier: 'predictive' }
                    : T extends 'governance'
                      ? { readonly scope: 'oversight'; readonly priority: 100; readonly tier: 'audit' }
                      : T extends 'incident'
                        ? { readonly scope: 'response'; readonly priority: 110; readonly tier: 'critical' }
                        : T extends 'intelligence'
                          ? { readonly scope: 'analytics'; readonly priority: 120; readonly tier: 'learning' }
                          : T extends 'lineage'
                            ? { readonly scope: 'trace'; readonly priority: 130; readonly tier: 'observability' }
                            : T extends 'lifecycle'
                              ? { readonly scope: 'evolution'; readonly priority: 140; readonly tier: 'planning' }
                              : T extends 'lattice'
                                ? { readonly scope: 'graph'; readonly priority: 150; readonly tier: 'composition' }
                                : T extends 'mesh'
                                  ? { readonly scope: 'network'; readonly priority: 160; readonly tier: 'routing' }
                                  : T extends 'observer'
                                    ? { readonly scope: 'monitoring'; readonly priority: 170; readonly tier: 'watch' }
                                    : T extends 'ops'
                                      ? { readonly scope: 'execution'; readonly priority: 180; readonly tier: 'runtime' }
                                      : T extends 'orchestrator'
                                        ? { readonly scope: 'coordination'; readonly priority: 190; readonly tier: 'master' }
                                        : T extends 'policy'
                                          ? { readonly scope: 'guardrail'; readonly priority: 200; readonly tier: 'control' }
                                          : T extends 'playbook'
                                            ? { readonly scope: 'automation'; readonly priority: 210; readonly tier: 'policy' }
                                            : T extends 'portfolio'
                                              ? { readonly scope: 'investment'; readonly priority: 220; readonly tier: 'finance' }
                                              : T extends 'quantum'
                                                ? { readonly scope: 'simulation'; readonly priority: 230; readonly tier: 'compute' }
                                                : T extends 'risk'
                                                  ? { readonly scope: 'hazard'; readonly priority: 240; readonly tier: 'safety' }
                                                  : T extends 'scenario'
                                                    ? { readonly scope: 'forecast'; readonly priority: 250; readonly tier: 'strategy' }
                                                    : T extends 'signal'
                                                      ? { readonly scope: 'telemetry'; readonly priority: 260; readonly tier: 'metrics' }
                                                      : T extends 'saga'
                                                        ? { readonly scope: 'workflow'; readonly priority: 270; readonly tier: 'execution' }
                                                        : T extends 'stability'
                                                          ? { readonly scope: 'resilience'; readonly priority: 280; readonly tier: 'hardening' }
                                                          : T extends 'storage'
                                                            ? { readonly scope: 'persistence'; readonly priority: 290; readonly tier: 'durability' }
                                                            : T extends 'strategy'
                                                              ? { readonly scope: 'planning'; readonly priority: 300; readonly tier: 'roadmap' }
                                                              : T extends 'telemetry'
                                                                ? { readonly scope: 'events'; readonly priority: 310; readonly tier: 'observability' }
                                                                : T extends 'timeline'
                                                                  ? { readonly scope: 'chronology'; readonly priority: 320; readonly tier: 'history' }
                                                                  : T extends 'vault'
                                                                    ? { readonly scope: 'secrets'; readonly priority: 330; readonly tier: 'protection' }
                                                                    : T extends 'workflow'
                                                                      ? { readonly scope: 'orchestration'; readonly priority: 340; readonly tier: 'orchestration' }
                                                                      : { readonly scope: 'unknown'; readonly priority: 999; readonly tier: 'fallback' };

type ActionProfile<T extends OrbitalAction> = T extends 'bootstrap' | 'admit' | 'adopt'
  ? { readonly mode: 'prepare'; readonly expected: 'setup'; readonly load: 1 }
  : T extends 'align' | 'annotate' | 'audit' | 'authorize'
    ? { readonly mode: 'review'; readonly expected: 'validation'; readonly load: 2 }
    : T extends 'broadcast' | 'coordinate' | 'compose' | 'connect'
      ? { readonly mode: 'assemble'; readonly expected: 'coordinated'; readonly load: 3 }
      : T extends 'consult' | 'debug' | 'deploy' | 'derive' | 'dispatch'
        ? { readonly mode: 'execute'; readonly expected: 'change'; readonly load: 4 }
        : T extends 'emit' | 'evaluate' | 'execute' | 'explore' | 'fabricate'
          ? { readonly mode: 'observe'; readonly expected: 'feedback'; readonly load: 5 }
          : T extends 'forecast' | 'fortify' | 'gather'
            ? { readonly mode: 'inspect'; expected: 'safety'; readonly load: 6 }
            : T extends 'govern' | 'observe' | 'orchestrate'
              ? { readonly mode: 'control'; readonly expected: 'stability'; readonly load: 7 }
              : T extends 'profile' | 'query' | 'route' | 'simulate'
                ? { readonly mode: 'analyze'; readonly expected: 'derivation'; readonly load: 8 }
                : T extends 'stabilize' | 'synchronize'
                  ? { readonly mode: 'restore'; readonly expected: 'recovery'; readonly load: 9 }
                  : { readonly mode: 'finalize'; readonly expected: 'closure'; readonly load: 10 };

export type ResolveRoute<T extends OrbitalRoute> = T extends `/${infer D}/${infer A}/${infer P}/${infer R}`
  ? D extends OrbitalDomain
    ? A extends OrbitalAction
      ? P extends OrbitalPhase
        ? R extends OrbitalResource
          ? RouteEnvelope<D, A, P, R> & DomainProfile<D> & ActionProfile<A> & {
              readonly path: T;
            }
          : never
        : never
      : never
    : never
  : never;

export type ResolveRouteCatalog<Catalog extends readonly OrbitalRoute[]> = {
  readonly [K in keyof Catalog]: Catalog[K] extends OrbitalRoute ? ResolveRoute<Catalog[K]> : never;
};

export type RouteCriticality<T extends OrbitalRoute> = ResolveRoute<T>['criticality'];
export type OrchestrateRoute<T extends OrbitalRoute> = ResolveRoute<T>['scope'] extends infer Scope
  ? Scope extends string
    ? Scope | `${Scope}/bounded`
    : never
  : never;

export type RouteResolutionUnion<T> = T extends OrbitalRoute ? ResolveRoute<T> : never;

export type DeepResolveRoute<T> = T extends OrbitalRoute
  ? RouteResolutionUnion<T> extends infer R
    ? R extends RouteEnvelope<infer D, infer A, infer P, infer Rsrc>
      ? [D, A, P, Rsrc]
      : never
    : never
  : never;

export const orbitalCatalogSeed = [
  '/atlas/bootstrap/init/catalog',
  '/continuity/adopt/probe/domain',
  '/chronicle/broadcast/steady/graph',
  '/command/compose/init/agent',
  '/control/govern/finalize/policy',
  '/crypto/audit/probe/vault',
  '/delivery/coordinate/steady/agent',
] as const;

export const orbitalRoutes = [
  '/atlas/bootstrap/init/catalog',
  '/continuity/adopt/probe/domain',
  '/chronicle/broadcast/steady/graph',
  '/command/compose/init/agent',
  '/control/govern/finalize/policy',
  '/crypto/audit/probe/vault',
  '/delivery/coordinate/stable/signal',
  '/drill/discover/probe/signal',
  '/fabric/dispatch/execute/agent',
  '/forecast/forecast/probe/agent',
  '/governance/audit/verify/graph',
  '/incident/execute/repair/signal',
  '/intelligence/derive/analyze/graph',
  '/lineage/connect/observe/graph',
  '/lifecycle/compose/probe/agent',
  '/lifecycle/probe/domain/agent',
  '/lattice/orchestrate/stabilize/agent',
  '/mesh/route/stabilize/agent',
  '/observer/synchronize/steady/signal',
  '/ops/orchestrate/probe/agent',
  '/orchestrator/execute/simulate/agent',
  '/policy/authorize/prepare/graph',
  '/playbook/gather/audit/agent',
  '/portfolio/inspect/stabilize/agent',
  '/quantum/query/analyze/agent',
  '/risk/fortify/repair/signal',
  '/scenario/orchestrate/probe/agent',
  '/signal/query/analyze/signal',
  '/saga/align/finalize/agent',
  '/stability/repair/stabilize/agent',
  '/storage/route/validate/vault',
  '/strategy/gather/probe/agent',
  '/telemetry/emit/observe/signal',
  '/timeline/profile/probe/agent',
  '/vault/route/finalize/vault',
  '/workflow/deploy/execute/graph',
] as const satisfies readonly OrbitalRoute[];

export type OrbitalCatalog = ResolveRouteCatalog<typeof orbitalRoutes>;

export const buildOrbitalCatalog = () => {
  const normalized = orbitalRoutes.map((route, index) => {
    const segments = route.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/)?.slice(1);
    if (!segments || segments.length !== 4) {
      throw new Error(`Unexpected route ${route}`);
    }
    const [domain, action, phase, resource] = segments as [
      OrbitalDomain,
      OrbitalAction,
      OrbitalPhase,
      OrbitalResource,
    ];
    const envelope: RouteEnvelope<OrbitalDomain, OrbitalAction, OrbitalPhase, OrbitalResource> = {
      routeId: `${route}:${index}` as Brand<string, 'orbital-route-id'>,
      domain,
      action,
      phase,
      resource,
      weight: index * 17,
      criticality: index % 4 === 0 ? 'critical' : index % 3 === 0 ? 'high' : index % 2 === 0 ? 'medium' : 'low',
    };
    return {
      route,
      envelope,
      resolved: route,
      score: envelope.weight + (action.length + resource.length + domain.length),
      chain: {
        domainProfile: envelope.criticality,
        actionProfile: envelope.action,
      },
    };
  });

  return normalized;
};

export const orbitalCatalog = buildOrbitalCatalog();
export const resolveOrbitalProfile = <T extends OrbitalRoute>(route: T): ResolveRoute<T> => {
  const match = route.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid route ${route}`);
  }

  const [domain, action, phase, resource] = match.slice(1) as [
    OrbitalDomain,
    OrbitalAction,
    OrbitalPhase,
    OrbitalResource,
  ];

  return {
    routeId: `${route}:runtime` as Brand<string, 'orbital-route-id'>,
    domain,
    action,
    phase,
    resource,
    weight: route.length,
    criticality: 'medium',
  } as ResolveRoute<T>;
};
