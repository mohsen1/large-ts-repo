import type { ChainTail } from '@shared/type-level/stress-deep-chain';
import type { OrchestratorRoute, RouteEnvelopeByState } from '@shared/type-level/stress-broad-conditional';
import { routeCatalogEnvelope } from '@shared/type-level/stress-broad-conditional';

export type TscDomain =
  | 'adapter'
  | 'api'
  | 'cluster'
  | 'command'
  | 'dashboard'
  | 'event'
  | 'fabric'
  | 'fleet'
  | 'flow'
  | 'incident'
  | 'insight'
  | 'lineage'
  | 'mesh'
  | 'policy'
  | 'planner'
  | 'recovery'
  | 'route'
  | 'signal'
  | 'situation'
  | 'strategy'
  | 'workflow'
  | 'telemetry'
  | 'workload';

export type TscMode =
  | 'run'
  | 'audit'
  | 'build'
  | 'drill'
  | 'review'
  | 'satisfy'
  | 'observe'
  | 'synchronize';

export type TscPriority = 'low' | 'medium' | 'high' | 'critical';

export type TscMetric = {
  readonly cpu: number;
  readonly mem: number;
  readonly qps: number;
  readonly latencyMs: number;
  readonly errorRate: number;
};

export interface TscRouteRow {
  readonly route: OrchestratorRoute;
  readonly envelope: RouteEnvelopeByState<OrchestratorRoute>;
  readonly metrics: TscMetric;
}

export type TscTemplateRow<T extends string> = T extends `${infer Domain}/${infer Action}/${infer Status}/${infer Id}`
  ? {
      readonly domain: Domain;
      readonly action: Action;
      readonly status: Status;
      readonly id: Id;
      readonly key: `${T}-${Action}`;
    }
  : { readonly key: T };

export type TscTemplateRows<T extends readonly string[]> = { readonly [K in keyof T]: T[K] extends string ? TscTemplateRow<T[K]> : never };

export type TscTemplateRemap<T extends Record<string, { readonly envelope: { readonly route: OrchestratorRoute } }>> = {
  [K in keyof T as `tsc_${K & string}`]: T[K]['envelope'];
};

export interface TscWorkspaceState {
  readonly workspaceId: string;
  readonly domain: TscDomain;
  readonly tenant: string;
  readonly mode: TscMode;
  readonly status: 'idle' | 'warming' | 'active' | 'suspended' | 'stopped';
  readonly priority: TscPriority;
  readonly routes: readonly TscRouteRow[];
  readonly eventLog: readonly TscWorkspaceEvent[];
  readonly activeCount: number;
  readonly selected: readonly string[];
}

export type TscWorkspaceEvent =
  | { readonly kind: 'route-evaluated'; readonly payload: ChainTail; readonly route: OrchestratorRoute }
  | { readonly kind: 'route-failed'; readonly payload: string }
  | { readonly kind: 'route-running'; readonly payload: string; readonly progress: number }
  | { readonly kind: 'route-complete'; readonly payload: number; readonly route: OrchestratorRoute }
  | { readonly kind: 'route-aborted'; readonly payload: string; readonly reason: string };

export type TscWorkspaceAction =
  | { readonly type: 'bootstrap'; readonly seed: string }
  | { readonly type: 'run'; readonly route: OrchestratorRoute }
  | { readonly type: 'pause'; readonly reason: string }
  | { readonly type: 'resume' }
  | { readonly type: 'abort'; readonly reason: string }
  | { readonly type: 'select'; readonly route: OrchestratorRoute }
  | { readonly type: 'clear' }
  | { readonly type: 'metrics'; readonly route: OrchestratorRoute; readonly metrics: TscMetric };

export type TscWorkspaceActionMap = {
  bootstrap: { readonly seed: string };
  run: { readonly route: OrchestratorRoute };
  pause: { readonly reason: string };
  resume: {};
  abort: { readonly reason: string };
  select: { readonly route: OrchestratorRoute };
  clear: {};
  metrics: { readonly route: OrchestratorRoute; readonly metrics: TscMetric };
};

export type TscWorkspaceActionUnion = {
  [K in keyof TscWorkspaceActionMap]: { readonly type: K } & TscWorkspaceActionMap[K];
}[keyof TscWorkspaceActionMap];

export const defaultRouteCatalog = {
  orchestrator: 'orchestrator/route/running/orch-12345-abcdef12',
  signal: 'signal/dispatch/created/sigx-12345-abcd1234',
  policy: 'policy/validate/received/poli-12345-abcd1234',
  recovery: 'recovery/repair/enqueued/reco-12345-fedcba12',
  fleet: 'fleet/simulate/finished/fleet-1234-zzzzzz12',
} as const;

export type TscRouteCatalog = typeof defaultRouteCatalog;

export type TscRouteTuple = readonly [
  typeof defaultRouteCatalog.orchestrator,
  typeof defaultRouteCatalog.signal,
  typeof defaultRouteCatalog.policy,
  typeof defaultRouteCatalog.recovery,
  typeof defaultRouteCatalog.fleet,
];

export const defaultRouteRows = [
  defaultRouteCatalog.orchestrator,
  defaultRouteCatalog.signal,
  defaultRouteCatalog.policy,
  defaultRouteCatalog.recovery,
  defaultRouteCatalog.fleet,
] as const as TscRouteTuple;

export const defaultRouteEntries = routeCatalogEnvelope(defaultRouteRows) as unknown as readonly TscRouteRow[];

type DefaultRouteRows = typeof defaultRouteRows;
export type TscTemplateCatalogRows = TscTemplateRows<DefaultRouteRows>;

export const TscTemplateCatalogRows: TscTemplateCatalogRows = defaultRouteRows.map((route) => parseRoute(route)) as unknown as TscTemplateCatalogRows;

export type TscTemplateRemapped = TscTemplateRemap<{
  orchestrator: { readonly envelope: (typeof TscTemplateCatalogRows)[0] & { readonly route: TscRouteTuple[0] } };
  signal: { readonly envelope: (typeof TscTemplateCatalogRows)[1] & { readonly route: TscRouteTuple[1] } };
  policy: { readonly envelope: (typeof TscTemplateCatalogRows)[2] & { readonly route: TscRouteTuple[2] } };
  recovery: { readonly envelope: (typeof TscTemplateCatalogRows)[3] & { readonly route: TscRouteTuple[3] } };
  fleet: { readonly envelope: (typeof TscTemplateCatalogRows)[4] & { readonly route: TscRouteTuple[4] } };
}>;

export const parseRoute = <T extends string>(route: T): TscTemplateRow<T> => {
  const split = route.split('/') as [string, string, string, string];
  return {
    domain: split[0],
    action: split[1],
    status: split[2],
    id: split[3] ?? 'n/a',
    key: `${route}-parsed`,
  } as TscTemplateRow<T>;
};

export const buildWorkspaceState = (tenant: string, domain: TscDomain): TscWorkspaceState => {
  return {
    workspaceId: `${tenant}:${domain}`,
    domain,
    tenant,
    mode: 'run',
    status: 'idle',
    priority: 'medium',
    routes: defaultRouteEntries,
    eventLog: [],
    activeCount: 0,
    selected: [],
  };
};
