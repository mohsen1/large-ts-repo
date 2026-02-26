import type { NoInfer } from './patterns';

export type StressLabVerb =
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
  | 'audit-trace'
  | 'policy-reset'
  | 'resource-scan'
  | 'state-rollback'
  | 'node-throttle'
  | 'policy-override'
  | 'mesh-evict'
  | 'workload-shape'
  | 'incident-close'
  | 'signal-stabilize'
  | 'timeline-drift'
  | 'resource-heal';

export type StressLabDomain =
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
  | 'store'
  | 'catalog'
  | 'trace'
  | 'workflow'
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
  | 'queue'
  | 'recovery'
  | 'registry'
  | 'scheduler'
  | 'signal'
  | 'store'
  | 'telemetry'
  | 'workload';

export type StressLabSeverity = 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info' | 'unknown';
export type StressLabId = `id-${number}` | `urn-${string}` | 'latest';

export type StressLabDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type DecStressLabDepth<D extends StressLabDepth> = D extends 0
  ? 0
  : D extends 1
    ? 0
    : D extends 2
      ? 1
      : D extends 3
        ? 2
        : D extends 4
          ? 3
          : D extends 5
            ? 4
            : D extends 6
              ? 5
              : D extends 7
                ? 6
                : D extends 8
                  ? 7
                  : D extends 9
                    ? 8
                    : D extends 10
                      ? 9
                      : D extends 11
                        ? 10
                        : D extends 12
                          ? 11
                          : 13;

export const stressLabTransitions = {
  discover: 'ingest',
  ingest: 'materialize',
  materialize: 'validate',
  validate: 'reconcile',
  reconcile: 'synthesize',
  synthesize: 'snapshot',
  snapshot: 'restore',
  restore: 'simulate',
  simulate: 'inject',
  inject: 'amplify',
  amplify: 'throttle',
  throttle: 'rebalance',
  rebalance: 'reroute',
  reroute: 'contain',
  contain: 'recover',
  recover: 'observe',
  observe: 'drill',
  drill: 'audit',
  audit: 'telemetry',
  telemetry: 'dispatch',
  dispatch: 'stabilize',
  stabilize: 'floodfill',
  floodfill: 'isolate',
  isolate: 'mesh-check',
  'mesh-check': 'policy-rewrite',
  'policy-rewrite': 'signal-triage',
  'signal-triage': 'workload-balance',
  'workload-balance': 'safety-guard',
  'safety-guard': 'latency-loop',
  'latency-loop': 'node-recover',
  'node-recover': 'route-fallback',
  'route-fallback': 'topology-drift',
  'topology-drift': 'signal-reconcile',
  'signal-reconcile': 'policy-enforce',
  'policy-enforce': 'load-shed',
  'load-shed': 'audit-trace',
  'audit-trace': 'recover',
  'policy-reset': 'resource-scan',
  'resource-scan': 'state-rollback',
  'state-rollback': 'node-throttle',
  'node-throttle': 'policy-override',
  'policy-override': 'mesh-evict',
  'mesh-evict': 'workload-shape',
  'workload-shape': 'incident-close',
  'incident-close': 'signal-stabilize',
  'signal-stabilize': 'timeline-drift',
  'timeline-drift': 'resource-heal',
  'resource-heal': 'audit-trace',
} as const satisfies Record<StressLabVerb, StressLabVerb>;

export type StressLabStageTransition = typeof stressLabTransitions;

export type ParsedStressLabCommand<T extends string> = T extends `${infer V}:${infer D}:${infer S}:${infer I}`
  ? V extends StressLabVerb
    ? D extends StressLabDomain
      ? S extends StressLabSeverity
        ? I extends StressLabId
          ? {
              readonly verb: V;
              readonly domain: D;
              readonly severity: S;
              readonly id: I;
              readonly raw: T;
              readonly path: `/${V}/${D}/${S}/${I}`;
            }
          : never
        : never
      : never
    : never
  : never;

export type StressLabGate<TVerb extends StressLabVerb> = TVerb extends 'discover'
  ? { readonly gate: 'start' }
  : TVerb extends 'ingest' | 'materialize'
    ? { readonly gate: 'ingest' }
    : TVerb extends 'validate' | 'reconcile'
      ? { readonly gate: 'evaluate' }
      : TVerb extends 'synthesize' | 'snapshot'
        ? { readonly gate: 'construct' }
        : TVerb extends 'restore' | 'simulate' | 'inject'
          ? { readonly gate: 'restore' }
          : TVerb extends 'amplify' | 'throttle' | 'rebalance'
            ? { readonly gate: 'stabilize' }
            : TVerb extends 'reroute' | 'contain' | 'recover'
              ? { readonly gate: 'isolate' }
              : TVerb extends 'observe' | 'drill' | 'audit'
                ? { readonly gate: 'inspect' }
                : TVerb extends 'telemetry' | 'dispatch' | 'stabilize'
                  ? { readonly gate: 'notify' }
                  : TVerb extends 'floodfill' | 'isolate' | 'policy-reset'
                    ? { readonly gate: 'evict' }
                    : TVerb extends 'resource-scan' | 'state-rollback' | 'mesh-check'
                      ? { readonly gate: 'scan' }
                      : TVerb extends 'policy-override' | 'mesh-evict'
                        ? { readonly gate: 'override' }
                        : TVerb extends 'workload-shape' | 'incident-close' | 'signal-stabilize'
                          ? { readonly gate: 'heal' }
                          : { readonly gate: 'default' };

export type StressLabBranch<TCommand extends string> = TCommand extends `${infer V}:${infer D}:${infer S}:${infer I}`
  ? ParsedStressLabCommand<TCommand> extends infer Parsed
    ? Parsed extends {
        readonly severity: infer Severity;
        readonly verb: infer Verb;
      }
      ? Verb extends StressLabVerb
        ? Severity extends StressLabSeverity
          ? Parsed & StressLabGate<Verb> & {
              readonly score: Severity extends 'critical' | 'emergency' ? 100 : 50;
              readonly command: TCommand;
              readonly next: StressLabStageTransition[Verb];
              readonly routeCode: `/${Verb}/${D & StressLabDomain}/${S & StressLabSeverity}`;
              readonly normalized: `${Uppercase<Verb>}/${Uppercase<D & StressLabDomain>}/${Uppercase<S & StressLabSeverity>}`;
            }
          : never
        : never
      : never
    : never
  : never;

export type StressLabDashboardRow = {
  readonly action: StressLabVerb;
  readonly domain: string;
  readonly severity: string;
  readonly id: string;
  readonly raw: string;
  readonly route: string;
  readonly signature: string;
};

export type StressLabChainStep<TVerb extends StressLabVerb, TDepth extends StressLabDepth> = TDepth extends 0
  ? { readonly verb: TVerb; readonly tail: never; readonly distance: 0 }
  : {
      readonly verb: TVerb;
      readonly depth: TDepth;
      readonly next: StressLabChainStep<StressLabStageTransition[TVerb], DecStressLabDepth<TDepth>>;
      readonly gate: StressLabGate<TVerb>;
    };

export type StressLabChainProfile<T extends readonly string[]> = {
  [Index in keyof T]: T[Index] extends `${infer V}:${infer D}:${infer S}:${infer I}`
    ? StressLabChainStep<
        V & StressLabVerb,
        13
      > & ParsedStressLabCommand<`${V & StressLabVerb}:${D & StressLabDomain}:${S & StressLabSeverity}:${I & StressLabId}`>
    : never;
}[number];

export type StressLabCatalog = readonly string[];

export const stressLabCatalog = [
  'discover:agent:critical:id-1',
  'ingest:store:high:id-2',
  'materialize:mesh:medium:id-3',
  'validate:policy:low:id-4',
  'reconcile:playbook:critical:id-5',
  'synthesize:orchestrator:info:id-6',
  'snapshot:dashboard:high:id-7',
  'restore:identity:low:id-8',
  'simulate:signal:emergency:id-9',
  'inject:queue:medium:id-10',
  'amplify:load:high:id-11',
  'throttle:registry:critical:id-12',
  'policy-reset:mesh:critical:id-25',
  'resource-scan:store:low:id-26',
  'state-rollback:workload:medium:id-27',
  'node-throttle:node:info:id-28',
  'mesh-check:cluster:critical:id-29',
  'policy-rewrite:registry:low:id-30',
  'signal-triage:observer:medium:id-31',
  'workload-balance:catalog:high:id-32',
  'safety-guard:cache:critical:id-33',
  'latency-loop:datastore:low:id-34',
  'node-recover:cluster:medium:id-35',
  'route-fallback:workflow:high:id-36',
  'topology-drift:network:critical:id-37',
  'signal-reconcile:playbook:low:id-38',
  'policy-enforce:policy:info:id-39',
  'load-shed:dashboard:medium:id-40',
  'audit-trace:trace:critical:id-41',
  'incident-close:cluster:critical:id-42',
  'signal-stabilize:store:medium:id-43',
  'timeline-drift:workload:high:id-44',
  'resource-heal:node:low:id-45',
  'mesh-evict:mesh:medium:id-46',
  'workload-shape:playbook:critical:id-47',
] as const;

export type DiscoveredChain = {
  readonly seed: (typeof stressLabCatalog)[number];
  readonly parsed: ParsedStressLabCommand<(typeof stressLabCatalog)[number]>;
  readonly branch: StressLabBranch<(typeof stressLabCatalog)[number]>;
  readonly path: StressLabChainProfile<typeof stressLabCatalog>;
};

export type StressLabCatalogEnvelope<T extends StressLabCatalog> = {
  [K in keyof T]: T[K] extends `${string}:${string}:${string}:${string}` ? StressLabBranch<T[K] & string> : never;
};

export type ResolvedLabCatalog = StressLabCatalogEnvelope<typeof stressLabCatalog>;

export const parseLabChain = <T extends StressLabCatalog[number]>(command: T): StressLabBranch<T> => {
  const parsed = command.split(':') as [StressLabVerb, StressLabDomain, StressLabSeverity, StressLabId];
  return {
    verb: parsed[0],
    domain: parsed[1],
    severity: parsed[2],
    id: parsed[3],
    raw: command,
    path: `/${parsed[0]}/${parsed[1]}/${parsed[2]}/${parsed[3]}`,
    command,
    next: stressLabTransitions[parsed[0]],
    score: parsed[2] === 'critical' || parsed[2] === 'emergency' ? 100 : 50,
    routeCode: `/${parsed[0]}/${parsed[1]}/${parsed[2]}`,
    normalized: `${parsed[0].toUpperCase()}/${parsed[1].toUpperCase()}/${parsed[2].toUpperCase()}`,
    gate: 'default',
  } as StressLabBranch<T>;
};

export const resolveLabCatalog = <T extends StressLabCatalog>(catalog: T): StressLabCatalogEnvelope<T> =>
  Object.fromEntries(
    catalog.map((command) => [command, parseLabChain(command)]),
  ) as unknown as StressLabCatalogEnvelope<T>;

export const stressLabChainProfile = resolveLabCatalog(stressLabCatalog);

export const stressLabRouteTemplateUnion = Object.keys(stressLabTransitions).reduce<Record<string, 1>>((acc, key) => {
  acc[key] = 1;
  return acc;
}, {} as Record<string, 1>);

export type LabBranchByNoInfer<
  TVerb extends StressLabVerb,
  TDomain extends StressLabDomain,
  TSeverity extends StressLabSeverity,
  TId extends StressLabId,
> = `${NoInfer<TVerb>}:${NoInfer<TDomain>}:${NoInfer<TSeverity>}:${NoInfer<TId>}`;
