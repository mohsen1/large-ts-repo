export type RecoveryVerb =
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
  | 'policy-reset'
  | 'resource-scan'
  | 'state-rollback'
  | 'node-throttle'
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
  | 'audit-trace';

export type RecoveryDomain =
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
  | 'pipeline'
  | 'planner'
  | 'queue'
  | 'recovery'
  | 'registry'
  | 'scheduler'
  | 'signal'
  | 'store'
  | 'telemetry'
  | 'workload';

export type RecoverySeverity = 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info';
export type RecoveryId = `id-${number}` | `uuid-${string}` | 'latest';
export type RecoveryCommand = string;

export const stageTransition = {
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
  'node-throttle': 'load-shed',
} as const satisfies Record<RecoveryVerb, RecoveryVerb>;

export type StageTransition = typeof stageTransition;

export type FiniteDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type DecDepth<D extends FiniteDepth> = D extends 0
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
                      : 0;

export type ParsedRecoveryCommand<T extends string> = {
  readonly action: RecoveryVerb;
  readonly domain: RecoveryDomain;
  readonly severity: RecoverySeverity;
  readonly id: RecoveryId;
  readonly route: `/${RecoveryVerb}/${RecoveryDomain}/${RecoverySeverity}/${RecoveryId}`;
} & {
  readonly raw: T;
};

export type RecoveryTemplate = `${RecoveryVerb}:${RecoveryDomain}:${RecoverySeverity}:${RecoveryId}`;

export type ResolveCommand<T extends RecoveryCommand> = T extends RecoveryTemplate
  ? ParsedRecoveryCommand<T> & {
      readonly next: RecoveryVerb;
      readonly canAdvance: true;
      readonly score: 1;
      readonly lane: 'in';
      readonly phase: 'collect';
    }
  : ParsedRecoveryCommand<T>;

export type StageChain<TAction extends RecoveryVerb, Depth extends FiniteDepth> = Depth extends 0
  ? { readonly stage: TAction; readonly depth: 0; readonly next: never }
  : TAction extends keyof StageTransition
    ? {
        readonly stage: TAction;
        readonly depth: Depth;
        readonly next: StageChain<StageTransition[TAction], DecDepth<Depth>>;
      }
    : { readonly stage: TAction; readonly depth: Depth; readonly next: never };

export type CommandChain<T extends RecoveryCommand> = {
  readonly seed: T;
  readonly resolved: ResolveCommand<T>;
  readonly parsed: ParsedRecoveryCommand<T>;
  readonly chain: StageChain<RecoveryVerb, 10>;
};

export type ResolveTuple<T extends readonly RecoveryCommand[]> = readonly ResolveCommand<T[number]>[];

export type ResolveUnion<T extends readonly RecoveryCommand[]> = ResolveCommand<T[number]>;

export type StageTransitionEdge<T extends RecoveryVerb> = {
  readonly source: T;
  readonly target: StageTransition[T];
  readonly path: `/${T}/${'to'}/${StageTransition[T]}`;
  readonly active: true;
};

export type StageTransitionCatalog = readonly StageTransitionEdge<RecoveryVerb>[];

export type CommandSetMap<T extends readonly RecoveryCommand[]> = {
  readonly [K in T[number]]: ResolveCommand<K>;
};

export type StageByActionOutput<TAction extends RecoveryVerb> = { readonly head: TAction; readonly next: StageTransition[TAction] };

export const commandCatalog = [
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
  'rebalance:gateway:low:id-13',
  'reroute:network:medium:id-14',
  'contain:incident:high:id-15',
  'recover:incident:critical:id-16',
  'observe:telemetry:info:id-17',
  'drill:playbook:critical:id-18',
  'audit:observer:low:id-19',
  'telemetry:identity:high:id-20',
  'dispatch:policy:low:id-21',
  'stabilize:policy:critical:id-22',
  'floodfill:signal:medium:id-23',
  'isolate:network:high:id-24',
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
 ] as const;

export type CatalogCommands = (typeof commandCatalog)[number];
export type CommandCatalog = readonly CatalogCommands[];

export const parseRecoveryCommand = <T extends RecoveryCommand>(value: T): ParsedRecoveryCommand<T> => {
  const [action, domain, severity, id] = value.split(':') as [RecoveryVerb, RecoveryDomain, RecoverySeverity, RecoveryId];
  return {
    action,
    domain,
    severity,
    id,
    route: `/${action}/${domain}/${severity}/${id}`,
    raw: value,
  } as ParsedRecoveryCommand<T>;
};

const buildChain = <TAction extends RecoveryVerb, TDepth extends FiniteDepth>(
  action: TAction,
  depth: TDepth,
): StageChain<TAction, TDepth> => {
  if (depth === 0) {
    return {
      stage: action,
      depth: 0,
      next: undefined as never,
    } as StageChain<TAction, TDepth>;
  }

  return {
    stage: action,
    depth,
    next: buildChain(stageTransition[action] as RecoveryVerb, (depth - 1) as DecDepth<TDepth>),
  } as StageChain<TAction, TDepth>;
};

export const resolveRecoveryCommand = <T extends RecoveryCommand>(command: T): ResolveCommand<T> => {
  const parsed = parseRecoveryCommand(command);
  const next = stageTransition[parsed.action as RecoveryVerb] as RecoveryVerb;

  return {
    ...parsed,
    next,
    canAdvance: true,
    score: 1,
    lane: 'in',
    phase: 'collect',
  } as ResolveCommand<T>;
};

export const stageProfile = commandCatalog.reduce<StageTransitionEdge<RecoveryVerb>[]>((acc, command) => {
  const parsed = parseRecoveryCommand(command);
  const next = stageTransition[parsed.action as RecoveryVerb] as RecoveryVerb;
  const edge: StageTransitionEdge<RecoveryVerb> = {
    source: parsed.action as RecoveryVerb,
    target: next as StageTransitionEdge<RecoveryVerb>['target'],
    path: `/${parsed.action}/to/${next}` as StageTransitionEdge<RecoveryVerb>['path'],
    active: true,
  };
  acc.push(edge);
  return acc;
}, []) as unknown as StageTransitionCatalog;

export const commandEnvelope = commandCatalog.map((command) => {
  const parsed = parseRecoveryCommand(command);
  return {
    seed: command,
    parsed,
    resolved: resolveRecoveryCommand(command),
    chain: buildChain(parsed.action, 10),
  };
}) as unknown as readonly CommandChain<CatalogCommands>[];

export type RouteConstraintSet = Readonly<Record<CatalogCommands, ResolveCommand<CatalogCommands>>>;

const routeConstraintSeed: { [K in CatalogCommands]?: ResolveCommand<RecoveryCommand> } = {};
for (const command of commandCatalog) {
  routeConstraintSeed[command] = resolveRecoveryCommand(command);
}
export const routeConstraintSet = routeConstraintSeed as RouteConstraintSet;

type MutableCommandVerbMap = { [Verb in RecoveryVerb]: RecoveryCommand[] };
export const commandMapByVerb = commandCatalog.reduce<MutableCommandVerbMap>((acc, command) => {
  const parsed = parseRecoveryCommand(command);
  acc[parsed.action].push(command);
  return acc;
}, {
  discover: [],
  ingest: [],
  materialize: [],
  validate: [],
  reconcile: [],
  synthesize: [],
  snapshot: [],
  restore: [],
  simulate: [],
  inject: [],
  amplify: [],
  throttle: [],
  rebalance: [],
  reroute: [],
  contain: [],
  recover: [],
  observe: [],
  drill: [],
  audit: [],
  telemetry: [],
  dispatch: [],
  stabilize: [],
  floodfill: [],
  isolate: [],
  'policy-reset': [],
  'resource-scan': [],
  'state-rollback': [],
  'node-throttle': [],
  'mesh-check': [],
  'policy-rewrite': [],
  'signal-triage': [],
  'workload-balance': [],
  'safety-guard': [],
  'latency-loop': [],
  'node-recover': [],
  'route-fallback': [],
  'topology-drift': [],
  'signal-reconcile': [],
  'policy-enforce': [],
  'load-shed': [],
  'audit-trace': [],
} as MutableCommandVerbMap);

export type CommandProfile = {
  readonly total: number;
  readonly names: readonly CatalogCommands[];
  readonly union: ResolveUnion<CommandCatalog>;
  readonly tuples: ResolveTuple<CommandCatalog>;
};

export const catalogProfile: CommandProfile = {
  total: commandCatalog.length,
  names: commandCatalog,
  union: [] as unknown as ResolveUnion<CommandCatalog>,
  tuples: [] as unknown as ResolveTuple<CommandCatalog>,
};

export const commandTuples: readonly RecoveryCommand[] = commandCatalog.slice();
export const routeFromCatalog = commandCatalog.map((command) => command.replaceAll(':', '/')) as readonly string[];
export const commandSetMap = ((): CommandSetMap<CommandCatalog> => {
  const out: { [K in string]: ResolveCommand<RecoveryCommand> } = {};
  for (const command of commandCatalog) {
    out[command] = resolveRecoveryCommand(command) as ResolveCommand<RecoveryCommand>;
  }
  return out as CommandSetMap<CommandCatalog>;
})();
