export type OrbitDomain =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'catalog'
  | 'cluster'
  | 'control'
  | 'delivery'
  | 'dispatcher'
  | 'edge'
    | 'signal'
    | 'telemetry'
  | 'fleet'
  | 'forensics'
  | 'gateway'
  | 'identity'
  | 'incident'
  | 'integration'
  | 'inventory'
  | 'ledger'
  | 'loader'
  | 'mesh'
  | 'observer'
  | 'orchestrator'
  | 'policy'
  | 'planner';

export type OrbitAction =
  | 'activate'
  | 'align'
  | 'audit'
  | 'bootstrap'
  | 'capture'
  | 'classify'
  | 'commit'
  | 'deploy'
  | 'dispatch'
  | 'drain'
  | 'evaluate'
  | 'gather'
  | 'ingest'
  | 'inspect'
  | 'isolate'
  | 'load'
  | 'observe'
  | 'orchestrate'
  | 'propagate'
  | 'quarantine'
  | 'reconcile'
  | 'restore'
  | 'route'
  | 'scale'
  | 'secure'
  | 'simulate'
  | 'snapshot'
  | 'stabilize'
  | 'triage'
  | 'verify';

export type OrbitStatus = 'new' | 'pending' | 'warming' | 'active' | 'degraded' | 'recovering' | 'terminated';

export type OrbitPhase = 'alpha' | 'beta' | 'release' | 'stable' | 'retired';

export type OrbitId = string;

export type OrbitRoute = `/${string}`;

export type ResolveActionClass<T extends OrbitAction> = T extends 'bootstrap'
  ? 'core'
  : T extends 'activate'
    ? 'runtime'
    : T extends 'ingest'
      ? 'stream'
      : T extends 'snapshot'
        ? 'state'
        : T extends 'reconcile'
          ? 'state'
          : T extends 'simulate'
            ? 'analysis'
            : T extends 'triage'
              ? 'ops'
              : T extends 'secure'
                ? 'defense'
                : T extends 'isolate'
                  ? 'defense'
                  : T extends 'orchestrate'
                    ? 'control'
                    : T extends 'dispatch'
                      ? 'control'
                      : T extends 'deploy'
                        ? 'control'
                        : T extends 'restore'
                          ? 'resilience'
                          : T extends 'propagate'
                            ? 'propagation'
                            : T extends 'audit'
                              ? 'governance'
                              : T extends 'verify'
                                ? 'analysis'
                                : T extends 'align'
                                  ? 'policy'
                                  : 'generic';

export type ResolveDomainAffinity<T extends OrbitDomain> = T extends 'agent' | 'orchestrator' | 'planner' | 'inventory' | 'catalog'
  ? 'control-plane'
  : T extends 'mesh' | 'observer' | 'control'
    ? 'runtime-plane'
    : T extends 'policy' | 'planner'
      ? 'policy-plane'
      : T extends 'catalog' | 'gateway' | 'edge' | 'cluster'
        ? 'edge-plane'
        : T extends 'incident' | 'recovery' | 'forensics'
          ? 'incident-plane'
          : T extends 'auth' | 'identity'
            ? 'identity-plane'
            : 'general-plane';

type RouteParsed<T extends string> = T extends `/${infer Domain}/${infer Action}/${infer Status}/${infer Phase}/${infer Id}`
  ? Domain extends OrbitDomain
    ? Action extends OrbitAction
      ? Status extends OrbitStatus
        ? Phase extends OrbitPhase
          ? {
              readonly domain: Domain;
              readonly action: Action;
              readonly status: Status;
              readonly phase: Phase;
              readonly id: Id & OrbitId;
            }
          : never
        : never
      : never
    : never
  : never;

export type OrbitParsedRoute<T extends OrbitRoute> = RouteParsed<T>;

export type ResolveOrbitCommand<
  TDomain extends OrbitDomain,
  TAction extends OrbitAction,
  TStatus extends OrbitStatus,
  TPhase extends OrbitPhase,
  TOriginal extends OrbitRoute,
> = TStatus extends 'new'
  ? {
      readonly command: 'bootstrap';
      readonly domainAffinity: ResolveDomainAffinity<TDomain>;
      readonly actionClass: ResolveActionClass<TAction>;
      readonly executionPhase: TPhase;
      readonly route: TOriginal;
    }
  : TStatus extends 'pending'
    ? {
        readonly command: 'schedule';
        readonly domainAffinity: ResolveDomainAffinity<TDomain>;
        readonly actionClass: ResolveActionClass<TAction>;
        readonly executionPhase: TPhase;
        readonly route: TOriginal;
      }
    : TStatus extends 'warming'
      ? {
          readonly command: 'preheat';
          readonly domainAffinity: ResolveDomainAffinity<TDomain>;
          readonly actionClass: ResolveActionClass<TAction>;
          readonly executionPhase: TPhase;
          readonly route: TOriginal;
        }
      : TStatus extends 'active'
        ? {
            readonly command: 'execute';
            readonly domainAffinity: ResolveDomainAffinity<TDomain>;
            readonly actionClass: ResolveActionClass<TAction>;
            readonly executionPhase: TPhase;
            readonly route: TOriginal;
          }
        : TStatus extends 'degraded'
          ? {
              readonly command: 'contain';
              readonly domainAffinity: ResolveDomainAffinity<TDomain>;
              readonly actionClass: ResolveActionClass<TAction>;
              readonly executionPhase: TPhase;
              readonly route: TOriginal;
            }
          : TStatus extends 'recovering'
            ? {
                readonly command: 'restore';
                readonly domainAffinity: ResolveDomainAffinity<TDomain>;
                readonly actionClass: ResolveActionClass<TAction>;
                readonly executionPhase: TPhase;
                readonly route: TOriginal;
              }
            : {
                readonly command: 'finalize';
                readonly domainAffinity: ResolveDomainAffinity<TDomain>;
                readonly actionClass: ResolveActionClass<TAction>;
                readonly executionPhase: TPhase;
                readonly route: TOriginal;
              };

export type CascadeResolve<T extends OrbitRoute, Remaining extends number = 3> = Remaining extends 0
  ? T
  : T extends OrbitRoute
    ? OrbitParsedRoute<T> extends infer Parsed
      ? Parsed extends {
          readonly domain: infer Domain extends OrbitDomain;
          readonly action: infer Action extends OrbitAction;
          readonly status: infer Status extends OrbitStatus;
          readonly phase: infer Phase extends OrbitPhase;
        }
        ? ResolveOrbitCommand<Domain, Action, Status, Phase, T>
        : never
      : never
    : never;

export type OrbitCommandPlan<T extends OrbitRoute> = CascadeResolve<T, 2>;

export type OrbitRouteUnion = OrbitRoute;
export type OrbitUnionDiscriminator = OrbitRouteUnion;
export type OrbitMatrix = OrbitCommandPlan<OrbitRoute>;
export type OrbitMatrixUnion = OrbitUnionDiscriminator;
