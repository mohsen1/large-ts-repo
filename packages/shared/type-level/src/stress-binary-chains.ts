import type { Brand, NoInfer } from './patterns';

export type SignalState =
  | 'new'
  | 'pending'
  | 'warming'
  | 'active'
  | 'degraded'
  | 'recovering'
  | 'terminated'
  | 'final';

export type SignalVerb =
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

export type SignalDomain =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'catalog'
  | 'cluster'
  | 'control'
  | 'delivery'
  | 'dispatcher'
  | 'edge'
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
  | 'planner'
  | 'signal'
  | 'telemetry';

export type SignalMode =
  | 'mode-fast'
  | 'mode-safe'
  | 'mode-diagnostic'
  | 'mode-offline'
  | 'mode-batch'
  | 'mode-replay';

export type SignalId = Brand<string, 'signal-id'>;
export type SignalRoute = `/${string}`;

type SeverityChain<T extends SignalVerb> = T extends
  | 'bootstrap'
  | 'restore'
  | 'triage'
  | 'verify'
  ? 'critical'
  : T extends 'activate' | 'deploy' | 'route' | 'orchestrate'
    ? 'high'
    : T extends 'simulate' | 'snapshot' | 'classify'
      ? 'elevated'
      : T extends 'isolate' | 'quarantine' | 'audit'
        ? 'high'
        : T extends 'inspect' | 'gather'
          ? 'medium'
          : T extends 'secure' | 'propagate' | 'evaluate'
            ? 'medium'
            : T extends 'align' | 'reconcile' | 'scale'
              ? 'low'
              : 'notice';

type FamilyChain<T extends SignalVerb> = T extends 'bootstrap'
  ? 'entry'
  : T extends 'activate'
    ? 'lifecycle'
    : T extends 'restore'
      ? 'resilience'
      : T extends 'triage'
        ? 'ops'
        : T extends 'simulate'
          ? 'analysis'
          : T extends 'isolate' | 'quarantine'
            ? 'defense'
            : T extends 'route' | 'align' | 'orchestrate'
              ? 'control'
              : 'default';

export type SignalEnvelope<T extends SignalRoute> =
  T extends `/${infer TDomain}/${infer TAction}/${infer TStatus}/${infer TId}`
    ? TDomain extends SignalDomain
      ? TAction extends SignalVerb
        ? TStatus extends SignalState
          ? {
              readonly route: T;
              readonly domain: TDomain;
              readonly verb: TAction;
              readonly status: TStatus;
              readonly id: `${TId}` & SignalId;
              readonly severity: SeverityChain<TAction>;
              readonly family: FamilyChain<TAction>;
            }
          : never
        : never
      : never
    : never;

export type SignalParser<T extends SignalRoute> =
  T extends `/${infer TDomain}/${infer TAction}/${infer TState}/${infer TId}`
    ? TDomain extends SignalDomain
      ? TAction extends SignalVerb
        ? TState extends SignalState
          ? {
              readonly domain: TDomain;
              readonly verb: TAction;
              readonly state: TState;
              readonly id: TId & SignalId;
              readonly key: `${TDomain}:${TAction}:${TState}`;
            }
          : never
        : never
      : never
    : never;

export type SignalRouteTokens<T extends SignalRoute> = T extends `/${infer A}/${infer B}/${infer C}/${infer D}`
  ? readonly [A, B, C, D]
  : readonly [];

export type SignalCatalogType = `/` | '' | typeof signalRouteCatalog[number];

export type SignalCatalogIndex = {
  [K in SignalCatalogType]: K extends SignalRoute
    ? SignalParser<K>
    : never;
};

export type SignalTruthClause<T extends string> =
  T extends `${infer Left}&${infer Rest}`
    ? { kind: 'and'; left: Left; right: SignalTruthClause<Rest> }
    : T extends `${infer Left}|${infer Rest}`
      ? { kind: 'or'; left: Left; right: SignalTruthClause<Rest> }
      : T extends `${infer Left}${'^'}${infer Rest}`
        ? { kind: 'xor'; left: Left; right: SignalTruthClause<Rest> }
        : { kind: 'leaf'; value: T };

export type SignalChain<T extends string, TAcc extends readonly boolean[] = []> =
  SignalTruthClause<T> extends infer Clause
    ? Clause extends { kind: 'and'; left: infer Left extends string; right: infer Right extends string }
      ? SignalChain<Right, [...TAcc, ...(Left extends '1' ? [true] : Left extends '0' ? [false] : [boolean])]>
      : Clause extends { kind: 'or'; left: infer Left extends string; right: infer Right extends string }
        ? SignalChain<Right, [...TAcc, ...(Left extends '1' ? [true] : Left extends '0' ? [false] : [boolean])]>
        : Clause extends { kind: 'xor'; left: infer Left extends string; right: infer Right extends string }
          ? SignalChain<Right, [...TAcc, ...(Left extends '1' ? [true] : Left extends '0' ? [false] : [boolean])]>
          : Clause extends { kind: 'leaf'; value: infer Value extends string }
            ? Value extends '1'
              ? [...TAcc, true]
              : Value extends '0'
                ? [...TAcc, false]
                : [...TAcc, boolean]
            : TAcc
    : TAcc;

export type SignalTruthProfile<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends string ? SignalChain<T[K], []> : never
} extends readonly (readonly boolean[])[] ? readonly boolean[] : never;

type Normalize<T> = {
  [K in keyof T as K extends `${infer Left}.${string}`
    ? `${Uppercase<Left>}`
    : K]: T[K];
};

export const signalPriority = {
  critical: 100,
  high: 70,
  elevated: 50,
  medium: 30,
  low: 15,
  notice: 5,
} as const satisfies Record<'critical' | 'high' | 'elevated' | 'medium' | 'low' | 'notice', number>;

export const signalRouteCatalog = [
  '/agent/simulate/active/agent-simulate-001',
  '/orchestrator/reconcile/degraded/orchestrator-reconcile-004',
  '/mesh/restore/active/mesh-restore-003',
  '/signal/triage/recovering/signal-triage-004',
  '/telemetry/audit/terminated/telemetry-audit-005',
  '/catalog/bootstrap/new/catalog-bootstrap-006',
  '/planner/align/warming/planner-align-007',
  '/policy/verify/pending/policy-verify-008',
  '/edge/isolate/active/edge-isolate-009',
  '/observer/route/degraded/observer-route-010',
  '/control/secure/active/control-secure-011',
  '/delivery/deploy/warming/delivery-deploy-012',
  '/identity/audit/recovering/identity-audit-013',
  '/cluster/inspect/active/cluster-inspect-014',
  '/artifact/capture/new/artifact-capture-015',
  '/incident/classify/pending/incident-classify-016',
  '/gateway/scale/active/gateway-scale-017',
  '/dispatcher/dispatch/new/dispatcher-dispatch-018',
  '/agent/stabilize/active/agent-stabilize-019',
  '/mesh/propagate/warming/mesh-propagate-020',
  '/telemetry/snapshot/degraded/telemetry-snapshot-021',
  '/identity/triage/recovering/identity-triage-022',
  '/policy/reconcile/pending/policy-reconcile-023',
  '/planner/reconcile/final/planner-reconcile-024',
  '/control/classify/degraded/control-classify-025',
  '/agent/orchestrate/active/agent-orchestrate-026',
  '/artifact/verify/active/artifact-verify-027',
  '/catalog/route/new/catalog-route-028',
  '/cluster/load/recovering/cluster-load-029',
  '/gateway/align/pending/gateway-align-030',
  '/edge/gather/active/edge-gather-031',
  '/telemetry/commit/active/telemetry-commit-032',
  '/observer/route/warming/observer-route-033',
  '/delivery/route/degraded/delivery-route-034',
  '/policy/secure/active/policy-secure-035',
  '/agent/quarantine/pending/agent-quarantine-036',
  '/mesh/drain/active/mesh-drain-037',
  '/control/recover/new/control-recover-038',
  '/incident/dispatch/active/incident-dispatch-039',
  '/forensics/evaluate/final/forensics-evaluate-040',
] as const satisfies readonly SignalRoute[];

export type SignalCatalogUnion = typeof signalRouteCatalog[number];

export type SignalCatalogByMode<TMode extends SignalMode> = TMode extends `mode-${infer _}`
  ? {
      readonly mode: TMode;
      readonly routes: SignalCatalogUnion[];
      readonly active: readonly SignalCatalogUnion[];
      readonly disabled: readonly SignalCatalogUnion[];
    }
  : never;

export type RouteTemplateCatalog<T extends readonly SignalRoute[]> = {
  [K in T[number] as K extends SignalRoute ? K : never]: SignalEnvelope<K>;
};

export const signalCatalogSchema = signalRouteCatalog.reduce(
  (acc, route) => {
    const parsed = (route as SignalRoute) as SignalParser<SignalRoute>;
    acc[route] = {
      route,
      parsed,
    };
    return acc;
  },
  {} as Record<SignalCatalogUnion, { route: SignalCatalogUnion; parsed: SignalParser<SignalCatalogUnion> }>,
);

export type RouteTemplateMap = Normalize<{
  [K in SignalCatalogUnion as `${K}`]: SignalParser<K>;
}>;

export const signalTruthProfile = ['1&1|0', '1^0&1', '0|0^1', '1&0', '0^0'] as const;

export type SignalTruthProfileValue = typeof signalTruthProfile;
export type SignalTruthProfileType = SignalTruthProfile<SignalTruthProfileValue>;

export const analyzeSignalCatalog = <TMode extends SignalMode>(
  routeMode: TMode,
  routes: readonly SignalCatalogUnion[],
): SignalCatalogByMode<TMode> => {
  const active = routes.filter((route) => route.includes('/active/')) as SignalCatalogUnion[];
  const disabled = routes.filter((route) => route.includes('/terminated/')) as SignalCatalogUnion[];
  const normal = routes.filter((route) => !route.includes('/terminated/')) as SignalCatalogUnion[];
  const byMode = routeMode === 'mode-fast'
    ? routes.filter((route) => route.includes('/active/'))
    : routeMode === 'mode-safe'
      ? routes.filter((route) => route.includes('/pending/'))
      : routeMode === 'mode-offline' || routeMode === 'mode-batch'
        ? routes.filter((route) => !route.includes('/active/') && !route.includes('/degraded/'))
        : routes;
  return {
    mode: routeMode,
    routes: byMode,
    active,
    disabled,
  } as unknown as SignalCatalogByMode<TMode>;
};

export type ChainToken<TMode extends string> = TMode & `mode-${string}`;

export const signalChainSignature = <T extends SignalCatalogUnion, TMode extends SignalMode>(
  route: T,
  mode: TMode,
  extra: NoInfer<TMode>,
) => {
  const tokens = route.split('/') as unknown as SignalRouteTokens<T>;
  return {
    route,
    mode,
    tokenCount: tokens.length,
    family: (tokens[1] as SignalVerb) ?? 'activate',
    severity: (tokens[2] as SignalState) ?? 'new',
    signature: tokens.join('/') as string,
    expression: `${extra}` as `${TMode & string}`,
    valid: route.includes('agent/') || route.includes('mesh/'),
  };
};

export type SignalChainSignature<
  T extends SignalCatalogUnion,
  TMode extends SignalMode,
  TExpr extends string = `${ChainToken<TMode>}`> = {
  readonly route: T;
  readonly mode: TMode;
  readonly tokenCount: number;
  readonly family: SignalEnvelope<T>['family'];
  readonly severity: SignalEnvelope<T>['severity'];
  readonly signature: string;
  readonly expression: TExpr;
  readonly valid: boolean;
};

export type SignalTruthBooleanProfile = {
  readonly [K in keyof SignalTruthProfileValue]: K extends keyof SignalTruthProfile<SignalTruthProfileValue>
    ? SignalTruthProfile<SignalTruthProfileValue>[K] extends readonly boolean[]
      ? SignalTruthProfile<SignalTruthProfileValue>[K][number]
      : never
    : never;
};

export const signalTruthProfileBooleans = signalTruthProfile.map((entry) => entry.includes('1'));
