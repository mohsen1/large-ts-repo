import { NoInfer } from './patterns';

export const spokeVerbs = [
  'discover',
  'ingest',
  'materialize',
  'validate',
  'reconcile',
  'synthesize',
  'snapshot',
  'restore',
  'simulate',
  'inject',
  'throttle',
  'policy-rewrite',
  'policy-reset',
  'signal-triage',
  'workload-balance',
  'safety-guard',
  'latency-loop',
  'node-recover',
  'route-fallback',
  'resource-scan',
  'policy-enforce',
  'node-throttle',
  'policy-audit',
  'policy-review',
  'policy-rollback',
  'policy-hedge',
  'policy-audit-fail',
  'policy-reset',
  'policy-guard',
] as const satisfies readonly string[];

export const spokeDomains = [
  'agent',
  'artifact',
  'auth',
  'build',
  'cache',
  'connector',
  'datastore',
  'edge',
  'execution',
  'gateway',
  'identity',
  'incident',
  'k8s',
  'load',
  'mesh',
  'node',
  'network',
  'observer',
  'planner',
  'policy',
  'signal',
  'store',
  'telemetry',
  'workload',
  'pipeline',
  'recovery',
  'scheduler',
] as const satisfies readonly string[];

export const spokeSeverities = ['low', 'medium', 'high', 'critical', 'emergency', 'info', 'unknown'] as const;

export type SpokeVerb = (typeof spokeVerbs)[number];
export type SpokeDomain = (typeof spokeDomains)[number];
export type SpokeSeverity = (typeof spokeSeverities)[number];
export type SpokeResource = `resource-${number}` | `urn-${string}`;
export type SpokeRoute = `${SpokeVerb}/${SpokeDomain}/${SpokeSeverity}/${SpokeResource}`;

type VerbFamily = {
  discover: 'inspect';
  ingest: 'capture';
  materialize: 'derive';
  validate: 'verify';
  reconcile: 'sync';
  synthesize: 'compose';
  snapshot: 'record';
  restore: 'recover';
  simulate: 'model';
  inject: 'inject';
  throttle: 'stabilize';
  'policy-rewrite': 'govern';
  'policy-reset': 'govern';
  'signal-triage': 'diagnose';
  'workload-balance': 'balance';
  'safety-guard': 'stabilize';
  'latency-loop': 'diagnose';
  'node-recover': 'recover';
  'route-fallback': 'reroute';
  'resource-scan': 'inspect';
  'policy-enforce': 'govern';
  'node-throttle': 'throttle';
  'policy-audit': 'assess';
  'policy-review': 'assess';
  'policy-rollback': 'assess';
  'policy-hedge': 'assess';
  'policy-audit-fail': 'assess';
  'policy-guard': 'assess';
};

type DomainPolicy = {
  agent: 'coordination';
  artifact: 'integrity';
  auth: 'access';
  build: 'fabrication';
  cache: 'consistency';
  connector: 'mesh';
  datastore: 'persistence';
  edge: 'telemetry';
  execution: 'workload';
  gateway: 'egress';
  identity: 'verification';
  incident: 'containment';
  k8s: 'orchestration';
  load: 'capacity';
  mesh: 'topology';
  node: 'infrastructure';
  network: 'routing';
  observer: 'inspection';
  planner: 'coordination';
  policy: 'governance';
  signal: 'diagnostics';
  store: 'persistence';
  telemetry: 'instrumentation';
  workload: 'utilization';
  pipeline: 'delivery';
  recovery: 'restoration';
  scheduler: 'coordination';
};

export type SpokeDomainPolicy<T extends SpokeDomain> = T extends keyof DomainPolicy ? DomainPolicy[T] : 'ops';
export type SpokeVerbFamily<T extends SpokeVerb> = T extends keyof VerbFamily ? VerbFamily[T] : 'generic';

type SeverityProfile = {
  low: 'standard';
  medium: 'elevated';
  high: 'critical';
  critical: 'urgent';
  emergency: 'critical';
  info: 'informational';
  unknown: 'uncertain';
};

export type SpokeSeverityProfile<T extends SpokeSeverity> = T extends keyof SeverityProfile ? SeverityProfile[T] : 'standard';

export type SpokeProbe<T extends SpokeRoute> = [T] extends [SpokeRoute]
  ? T extends `${infer Verb}/${infer Domain}/${infer Severity}/${infer Resource}`
    ? Verb extends SpokeVerb
      ? Domain extends SpokeDomain
        ? Severity extends SpokeSeverity
          ? Resource extends SpokeResource
            ? {
                readonly verb: Verb;
                readonly domain: Domain;
                readonly severity: Severity;
                readonly resource: Resource;
                readonly policy: SpokeVerbFamily<Verb>;
                readonly domainPolicy: SpokeDomainPolicy<Domain>;
                readonly profile: SpokeSeverityProfile<Severity>;
              }
            : never
          : never
        : never
      : never
    : never
  : never;

export const spokeRouteCatalog = [
  'discover/agent/low/resource-1',
  'ingest/artifact/medium/resource-2',
  'materialize/build/high/resource-3',
  'validate/cache/critical/resource-4',
  'reconcile/connector/info/resource-5',
  'synthesize/network/emergency/resource-6',
  'snapshot/node/high/resource-7',
  'restore/pipeline/medium/resource-8',
  'simulate/telemetry/low/urn-9',
  'inject/identity/info/resource-10',
  'throttle/mesh/critical/resource-11',
  'policy-rewrite/policy/emergency/resource-12',
  'policy-enforce/policy/critical/resource-13',
  'signal-triage/observer/high/resource-14',
  'safety-guard/incident/medium/resource-15',
  'latency-loop/queue/info/resource-16',
  'node-recover/identity/low/resource-17',
  'route-fallback/network/unknown/urn-18',
  'workload-balance/workload/medium/resource-19',
  'resource-scan/edge/info/urn-20',
  'node-throttle/node/low/resource-21',
  'policy-reset/identity/high/resource-22',
  'snapshot/recovery/info/resource-23',
  'snapshot/network/high/resource-24',
  'policy-audit/agent/critical/resource-25',
  'policy-review/policy/emergency/urn-26',
  'policy-rollback/identity/high/urn-27',
  'policy-hedge/network/info/resource-28',
  'policy-audit-fail/observer/low/resource-29',
  'policy-guard/agent/critical/resource-30',
] as const;

export function parseSpokeRoute<T extends SpokeRoute>(route: T): SpokeProbe<T> {
  const [rawVerb, rawDomain, rawSeverity, rawResource] = route.split('/') as [
    SpokeVerb,
    SpokeDomain,
    SpokeSeverity,
    SpokeResource,
  ];
  return {
    verb: rawVerb,
    domain: rawDomain,
    severity: rawSeverity,
    resource: rawResource,
    policy: rawVerb,
    domainPolicy: rawDomain,
    profile: rawSeverity,
  } as SpokeProbe<T>;
}

export const spokeCatalogProfile: SpokeProbe<SpokeRoute>[] = spokeRouteCatalog.map((route) =>
  parseSpokeRoute(route as SpokeRoute),
);

export const spokeRouteByVerb = <V extends SpokeVerb>(seed: NoInfer<V>): SpokeProbe<Extract<SpokeRoute, `${V}/${string}`>>[] => {
  return spokeCatalogProfile.filter((entry): entry is SpokeProbe<Extract<SpokeRoute, `${V}/${string}`>> => entry.verb === seed);
};

export type SpokeTrace = `/${SpokeVerb}/${SpokeDomain}/${SpokeSeverity}`;
export const routeTraceTags: ReadonlyArray<[SpokeVerb, SpokeDomain, SpokeSeverity, string]> = spokeRouteCatalog.map((route) =>
  route.split('/') as [SpokeVerb, SpokeDomain, SpokeSeverity, string],
);
