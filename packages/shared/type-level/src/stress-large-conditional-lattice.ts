export type RecoveryDomain =
  | 'identity'
  | 'continuity'
  | 'signal'
  | 'fabric'
  | 'policy'
  | 'plan'
  | 'audit'
  | 'incident'
  | 'resilience'
  | 'observability'
  | 'runtime'
  | 'mesh'
  | 'workbench'
  | 'workflow'
  | 'chronicle'
  | 'inventory'
  | 'forecast'
  | 'stability'
  | 'quantum'
  | 'timeline'
  | 'sustain'
  | 'playbook'
  | 'risk'
  | 'oracle'
  | 'telemetry'
  | 'automation'
  | 'simulation'
  | 'analytics'
  | 'coordination'
  | 'notify'
  | 'command'
  | 'drill'
  | 'policy-intel'
  | 'ops'
  | 'fabric-orchestrator'
  | 'security'
  | 'reliability'
  | 'drift'
  | 'forecasting'
  | 'fabric-intent';

export type RecoveryVerb =
  | 'start'
  | 'plan'
  | 'simulate'
  | 'activate'
  | 'drain'
  | 'heal'
  | 'audit'
  | 'rollback'
  | 'close'
  | 'commit'
  | 'release'
  | 'escalate';

export type RecoveryPhase =
  | 'draft'
  | 'queued'
  | 'running'
  | 'finalizing'
  | 'complete'
  | 'failed'
  | 'throttled';

type BuildNat<T extends number, R extends unknown[] = []> = R['length'] extends T ? R : BuildNat<T, [...R, unknown]>;
type DecNat<T extends number> = BuildNat<T> extends [infer _First, ...infer Rest] ? Rest['length'] : 0;

type DomainDecision<T extends RecoveryDomain> =
  T extends 'identity'
    ? 'bind'
    : T extends 'continuity'
      ? 'snapshot'
      : T extends 'signal'
        ? 'route'
        : T extends 'fabric'
          ? 'mesh'
          : T extends 'policy'
            ? 'resolve'
            : T extends 'plan'
              ? 'draft'
              : T extends 'audit'
                ? 'trace'
                : T extends 'incident'
                  ? 'investigate'
                  : T extends 'resilience'
                    ? 'stabilize'
                    : T extends 'observability'
                      ? 'measure'
                      : T extends 'runtime'
                        ? 'execute'
                        : T extends 'mesh'
                          ? 'rebalance'
                          : T extends 'workbench'
                            ? 'simulate'
                            : T extends 'workflow'
                              ? 'sequence'
                              : T extends 'chronicle'
                                ? 'record'
                                : T extends 'inventory'
                                  ? 'catalog'
                                  : T extends 'forecast'
                                    ? 'predict'
                                    : T extends 'stability'
                                      ? 'monitor'
                                      : T extends 'quantum'
                                        ? 'supervise'
                                        : T extends 'timeline'
                                          ? 'rewind'
                                          : T extends 'sustain'
                                            ? 'preserve'
                                            : T extends 'playbook'
                                              ? 'publish'
                                              : T extends 'risk'
                                                ? 'assess'
                                                : T extends 'oracle'
                                                  ? 'query'
                                                  : T extends 'telemetry'
                                                    ? 'observe'
                                                    : T extends 'automation'
                                                      ? 'trigger'
                                                      : T extends 'simulation'
                                                        ? 'emulate'
                                                        : T extends 'analytics'
                                                          ? 'learn'
                                                          : T extends 'coordination'
                                                            ? 'synchronize'
                                                            : T extends 'notify'
                                                              ? 'broadcast'
                                                              : T extends 'command'
                                                                ? 'dispatch'
                                                                : T extends 'drill'
                                                                  ? 'rehearse'
                                                                  : T extends 'policy-intel'
                                                                    ? 'infer'
                                                                    : T extends 'ops'
                                                                      ? 'operate'
                                                                      : T extends 'fabric-orchestrator'
                                                                        ? 'orchestrate'
                                                                        : T extends 'security'
                                                                          ? 'harden'
                                                                          : T extends 'reliability'
                                                                            ? 'stabilize'
                                                                            : T extends 'drift'
                                                                              ? 'normalize'
                                                                              : T extends 'forecasting'
                                                                                ? 'recalculate'
                                                                                : T extends 'fabric-intent'
                                                                                  ? 'align'
                                                                                  : 'hold';

export type ConditionalDecision<T extends RecoveryDomain | RecoveryVerb> =
  T extends RecoveryDomain
    ? DomainDecision<T>
    : T extends RecoveryVerb
      ? T extends 'start'
        ? 'phase:start'
        : T extends 'plan'
          ? 'phase:plan'
          : T extends 'simulate'
            ? 'phase:simulate'
            : T extends 'activate'
              ? 'phase:active'
              : T extends 'drain'
                ? 'phase:quench'
                : T extends 'heal'
                  ? 'phase:repair'
                  : T extends 'audit'
                    ? 'phase:audit'
                    : T extends 'rollback'
                      ? 'phase:rollback'
                      : T extends 'close'
                        ? 'phase:close'
                        : T extends 'commit'
                          ? 'phase:commit'
                          : T extends 'release'
                            ? 'phase:release'
                            : T extends 'escalate'
                              ? 'phase:escalate'
                              : 'phase:unknown'
      : never;

type DomainVerbMap<T extends RecoveryDomain> = T extends 'identity'
  ? { kind: 'identity'; scope: 'identity'; action: 'bind' | 'resolve' }
  : T extends 'continuity'
    ? { kind: 'continuity'; scope: 'continuity'; action: 'snapshot' | 'reconcile' }
    : T extends 'signal'
      ? { kind: 'signal'; scope: 'signal'; action: 'route' | 'observe' }
      : T extends 'fabric'
        ? { kind: 'fabric'; scope: 'fabric'; action: 'mesh' | 'rebalance' }
        : T extends 'policy'
          ? { kind: 'policy'; scope: 'policy'; action: 'resolve' | 'publish' }
          : T extends 'plan'
            ? { kind: 'plan'; scope: 'plan'; action: 'draft' | 'simulate' }
            : T extends 'audit'
              ? { kind: 'audit'; scope: 'audit'; action: 'trace' | 'validate' }
              : T extends 'incident'
                ? { kind: 'incident'; scope: 'incident'; action: 'investigate' | 'broadcast' }
                : T extends 'resilience'
                  ? { kind: 'resilience'; scope: 'resilience'; action: 'stabilize' | 'monitor' }
                  : T extends 'observability'
                    ? { kind: 'observability'; scope: 'observability'; action: 'measure' | 'trace' }
                    : T extends 'runtime'
                      ? { kind: 'runtime'; scope: 'runtime'; action: 'execute' | 'commit' }
                      : T extends 'mesh'
                        ? { kind: 'mesh'; scope: 'mesh'; action: 'orchestrate' | 'rebalance' }
                        : T extends 'workbench'
                          ? { kind: 'workbench'; scope: 'workbench'; action: 'simulate' | 'publish' }
                          : T extends 'workflow'
                            ? { kind: 'workflow'; scope: 'workflow'; action: 'sequence' | 'schedule' }
                            : T extends 'chronicle'
                              ? { kind: 'chronicle'; scope: 'chronicle'; action: 'record' | 'trace' }
                              : T extends 'inventory'
                                ? { kind: 'inventory'; scope: 'inventory'; action: 'catalog' | 'sync' }
                                : T extends 'forecast'
                                  ? { kind: 'forecast'; scope: 'forecast'; action: 'predict' | 'publish' }
                                  : T extends 'stability'
                                    ? { kind: 'stability'; scope: 'stability'; action: 'monitor' | 'alert' }
                                    : T extends 'quantum'
                                      ? { kind: 'quantum'; scope: 'quantum'; action: 'supervise' | 'simulate' }
                                      : T extends 'timeline'
                                        ? { kind: 'timeline'; scope: 'timeline'; action: 'rewind' | 'rewind-validate' }
                                        : T extends 'sustain'
                                          ? { kind: 'sustain'; scope: 'sustain'; action: 'preserve' | 'archive' }
                                          : T extends 'playbook'
                                            ? { kind: 'playbook'; scope: 'playbook'; action: 'publish' | 'run' }
                                            : T extends 'risk'
                                              ? { kind: 'risk'; scope: 'risk'; action: 'assess' | 'mitigate' }
                                              : T extends 'oracle'
                                                ? { kind: 'oracle'; scope: 'oracle'; action: 'query' | 'infer' }
                                                : T extends 'telemetry'
                                                  ? { kind: 'telemetry'; scope: 'telemetry'; action: 'observe' | 'measure' }
                                                  : T extends 'automation'
                                                    ? { kind: 'automation'; scope: 'automation'; action: 'trigger' | 'trigger-retry' }
                                                    : T extends 'simulation'
                                                      ? { kind: 'simulation'; scope: 'simulation'; action: 'emulate' | 'replay' }
                                                      : T extends 'analytics'
                                                        ? { kind: 'analytics'; scope: 'analytics'; action: 'learn' | 'score' }
                                                        : T extends 'coordination'
                                                          ? { kind: 'coordination'; scope: 'coordination'; action: 'synchronize' | 'route' }
                                                          : T extends 'notify'
                                                            ? { kind: 'notify'; scope: 'notify'; action: 'broadcast' | 'notify' }
                                                            : T extends 'command'
                                                              ? { kind: 'command'; scope: 'command'; action: 'dispatch' | 'reassign' }
                                                              : T extends 'drill'
                                                                ? { kind: 'drill'; scope: 'drill'; action: 'rehearse' | 'assess' }
                                                                : T extends 'policy-intel'
                                                                  ? { kind: 'policy-intel'; scope: 'policy-intel'; action: 'infer' | 'broadcast' }
                                                                  : T extends 'ops'
                                                                    ? { kind: 'ops'; scope: 'ops'; action: 'operate' | 'stabilize' }
                                                                    : T extends 'fabric-orchestrator'
                                                                      ? { kind: 'fabric-orchestrator'; scope: 'fabric-orchestrator'; action: 'orchestrate' | 'balance' }
                                                                      : T extends 'security'
                                                                        ? { kind: 'security'; scope: 'security'; action: 'harder' | 'audit' }
                                                                        : T extends 'reliability'
                                                                          ? { kind: 'reliability'; scope: 'reliability'; action: 'stabilize' | 'monitor' }
                                                                          : T extends 'drift'
                                                                            ? { kind: 'drift'; scope: 'drift'; action: 'normalize' | 'alert' }
                                                                            : T extends 'forecasting'
                                                                              ? { kind: 'forecasting'; scope: 'forecasting'; action: 'recalculate' | 'publish' }
                                                                              : { kind: 'other'; scope: 'shared'; action: 'hold' | 'review' };

type ConditionalRoute<T extends RecoveryDomain> = DomainVerbMap<T> extends infer R
  ? R extends { kind: infer K; scope: infer S; action: infer A }
    ? { readonly domain: T; readonly kind: K & string; readonly scope: S & string; readonly action: A & string }
    : never
  : never;

export type ResolveRoute<T> = T extends RecoveryDomain ? ConditionalRoute<T> : never;

export type ResolveUnion<T extends RecoveryDomain> = T extends RecoveryDomain ? ResolveRoute<T> : never;

export type ResolveDepth<T extends RecoveryDomain, N extends number = 30> = N extends 0
  ? ResolveRoute<T>
  : ResolveDepth<T, DecNat<N>>;

export type DecisionForest<T extends RecoveryDomain | RecoveryVerb> = {
  readonly root: T;
  readonly phase: RecoveryPhase;
  readonly decision: ConditionalDecision<T>;
  readonly chain: ResolveUnion<RecoveryDomain>[];
};

export type RouteProjection = {
  readonly [D in RecoveryDomain]: ResolveRoute<D>;
}[RecoveryDomain];

export const domainMatrix = ['identity', 'continuity', 'signal', 'fabric', 'policy', 'plan', 'audit', 'incident', 'resilience', 'observability', 'runtime', 'mesh', 'workbench'] as const;

export const buildDecisionCatalog = (): ReadonlyArray<RouteProjection> => {
  const domains: readonly RecoveryDomain[] = [
    'identity',
    'continuity',
    'signal',
    'fabric',
    'policy',
    'plan',
    'audit',
    'incident',
    'resilience',
    'observability',
    'runtime',
    'mesh',
    'workbench',
    'workflow',
    'chronicle',
    'inventory',
    'forecast',
    'stability',
    'quantum',
    'timeline',
    'sustain',
    'playbook',
    'risk',
    'oracle',
    'telemetry',
    'automation',
    'simulation',
    'analytics',
    'coordination',
    'notify',
    'command',
    'drill',
    'policy-intel',
    'ops',
    'fabric-orchestrator',
    'security',
    'reliability',
    'drift',
    'forecasting',
    'fabric-intent',
  ];

  return domains.map((domain) => ({
    domain,
    kind: `kind:${domain}`,
    scope: `scope:${domain}`,
    action: `action:${domain}`,
  })) as unknown as ReadonlyArray<RouteProjection>;
};
