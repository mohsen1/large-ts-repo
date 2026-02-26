export type ConstraintDomain =
  | 'incident'
  | 'fabric'
  | 'timeline'
  | 'telemetry'
  | 'workflow'
  | 'policy'
  | 'safety'
  | 'recovery';

export type ConstraintVerb =
  | 'ingest'
  | 'compose'
  | 'propagate'
  | 'verify'
  | 'synthesize'
  | 'simulate'
  | 'evict'
  | 'drill';

export type ConstraintInput<
  TDomain extends ConstraintDomain,
  TVerb extends ConstraintVerb,
  TTag extends string = string,
> = `/${TDomain}/${TVerb}/${TTag}`;

export type ConstraintRecord<TInput extends string> = TInput extends `/${infer TDomain}/${infer TVerb}/${infer TTag}`
  ? TDomain extends ConstraintDomain
    ? TVerb extends ConstraintVerb
      ? {
          readonly domain: TDomain;
          readonly verb: TVerb;
          readonly tag: TTag;
          readonly phase: TVerb extends 'simulate' | 'drill' | 'compose' ? 'active' : 'passive';
        }
      : never
    : never
  : never;

export type ConstraintLookup<T extends string> = T extends ConstraintInput<infer TDomain, infer TVerb, infer TTag>
  ? ConstraintRecord<ConstraintInput<TDomain, TVerb, TTag>>
  : never;

export type ConstraintUnion =
  | ConstraintRecord<'/incident/compose/tag-a'>
  | ConstraintRecord<'/fabric/simulate/tag-b'>
  | ConstraintRecord<'/workflow/verify/tag-c'>
  | ConstraintRecord<'/policy/ingest/tag-d'>
  | ConstraintRecord<'/timeline/evict/tag-e'>
  | ConstraintRecord<'/telemetry/propagate/tag-f'>
  | ConstraintRecord<'/safety/drill/tag-g'>
  | ConstraintRecord<'/recovery/synthesize/tag-h'>;

export type ConstraintScope<T extends ConstraintUnion> = T extends { domain: infer D; verb: infer V }
  ? D extends ConstraintDomain
    ? V extends ConstraintVerb
      ? {
          readonly scope:
            | (D extends 'incident' | 'workflow' ? 'execution' : D extends 'telemetry' ? 'observation' : 'maintenance')
            | never;
          readonly constraints: {
            readonly domainGuard: D;
            readonly verbGuard: V;
          };
          readonly domain: D;
          readonly verb: V;
        }
      : never
    : never
  : never;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type ConstraintSolver<
  TInput,
  TGuard extends ConstraintInput<ConstraintDomain, ConstraintVerb, string>,
> = TInput extends ConstraintInput<infer TDomain, infer TVerb, infer TTag>
  ? TDomain extends ConstraintDomain
    ? TVerb extends ConstraintVerb
      ? TInput extends TGuard
        ? {
            readonly domain: TDomain;
            readonly verb: TVerb;
            readonly tag: TTag;
            readonly safe: true;
            readonly guard: TGuard;
          }
        : {
            readonly domain: TDomain;
            readonly verb: TVerb;
            readonly tag: TTag;
            readonly safe: false;
          }
      : never
    : never
  : never;

export interface ConstraintState<
  T extends ConstraintDomain = ConstraintDomain,
  V extends ConstraintVerb = ConstraintVerb,
> {
  readonly currentDomain: T;
  readonly verb: V;
  readonly active: boolean;
}

export type ConstraintResolverTemplate<T extends ConstraintState> =
  `/${T['currentDomain']}/${T['verb']}/${string}`;

export type ConstraintFactory<T extends ConstraintState> =
  <R extends ConstraintInput<ConstraintDomain, ConstraintVerb, string>>(
    route: NoInfer<R>,
  ) => ConstraintSolver<R, ConstraintResolverTemplate<T>>;

export function resolveConstraints<T extends ConstraintState>(state: T): ConstraintFactory<T> {
  return ((route) => {
    const [_, domain, verb, tag] = route.split('/') as [string, ConstraintDomain, ConstraintVerb, string];
    const isMatchingDomain = domain === state.currentDomain;
    const isMatchingVerb = verb === state.verb;

    return {
      domain,
      verb,
      tag,
      safe: state.active && isMatchingDomain && isMatchingVerb,
      guard: `/${state.currentDomain}/${state.verb}/guard` as ConstraintResolverTemplate<T>,
    } as ConstraintSolver<
      typeof route,
      ConstraintResolverTemplate<T>
    >;
  }) as ConstraintFactory<T>;
}

export function enforcePolicy<TDomain extends ConstraintDomain, TVerb extends ConstraintVerb>(
  route: ConstraintInput<TDomain, TVerb, string>,
  state: ConstraintState<TDomain, TVerb>,
): ConstraintSolver<typeof route, ConstraintInput<TDomain, TVerb, string>>;
export function enforcePolicy(
  route: string,
  state: ConstraintState,
): ConstraintSolver<
  string,
  `/${ConstraintDomain}/${ConstraintVerb}/${string}`
>;
export function enforcePolicy(
  route: string,
  state: ConstraintState,
): ConstraintSolver<
  string,
  ConstraintResolverTemplate<
    ConstraintState<ConstraintDomain, ConstraintVerb>
  >
> {
  const parsed = route.split('/');
  return {
    domain: (parsed[1] as ConstraintDomain) ?? 'incident',
    verb: (parsed[2] as ConstraintVerb) ?? 'ingest',
    tag: parsed[3] ?? 'tag',
    safe: state.active
      && parsed[1] === state.currentDomain
      && parsed[2] === state.verb,
    guard: `/${state.currentDomain}/${state.verb}/guard`,
  } as ConstraintSolver<
    string,
    `/${ConstraintDomain}/${ConstraintVerb}/${string}`
  >;
}

export type ConstraintResolverSuite =
  | ReturnType<typeof resolveConstraints<{ currentDomain: 'incident'; verb: 'compose'; active: true }>>
  | ReturnType<typeof resolveConstraints<{ currentDomain: 'workflow'; verb: 'simulate'; active: false }>>;

export const incidentFactory = resolveConstraints({ currentDomain: 'incident', verb: 'compose', active: true });
export const workflowFactory = resolveConstraints({ currentDomain: 'workflow', verb: 'simulate', active: false });

export const constraintResults = {
  incident: incidentFactory('/incident/compose/tag-a'),
  workflow: workflowFactory('/workflow/simulate/tag-b'),
  policy: enforcePolicy('/policy/ingest/tag-c', { currentDomain: 'policy', verb: 'ingest', active: true }),
} as const;

type ConstraintMapEntry = (typeof constraintResults)[keyof typeof constraintResults];
export const constraintMap = new Map<string, ConstraintMapEntry>([
  ['incident', constraintResults.incident],
  ['workflow', constraintResults.workflow],
  ['policy', constraintResults.policy],
]);

export const normalizePolicyRoute = <T extends ConstraintInput<ConstraintDomain, ConstraintVerb, string>>(route: T) => {
  const parts = route.split('/') as [string, ConstraintDomain, ConstraintVerb, string];
  return {
    domain: parts[1],
    verb: parts[2],
    tag: parts[3],
    record: {
      ...resolveConstraints({ currentDomain: parts[1], verb: parts[2], active: true })(route),
    },
  } as const;
};

export const solveConstraintSeries = <TSeries extends readonly ConstraintInput<ConstraintDomain, ConstraintVerb, string>[]>(
  series: TSeries,
) => {
  const state: ConstraintState = {
    currentDomain: 'incident',
    verb: 'compose',
    active: true,
  };
  const fn = resolveConstraints(state);

  return series.map((route) => fn(route));
};

export const constraintCatalog = [
  '/incident/compose/tag-a',
  '/fabric/simulate/tag-b',
  '/workflow/verify/tag-c',
  '/policy/ingest/tag-d',
  '/timeline/evict/tag-e',
  '/telemetry/propagate/tag-f',
  '/safety/drill/tag-g',
  '/recovery/synthesize/tag-h',
] as const satisfies readonly ConstraintInput<ConstraintDomain, ConstraintVerb, string>[];

export type ConstraintBundle<
  T extends readonly ConstraintInput<ConstraintDomain, ConstraintVerb, string>[],
> = {
  readonly series: T;
  readonly scope: ConstraintScope<ConstraintUnion>;
  readonly output: {
    [K in keyof T]: ConstraintSolver<T[K], `/${ConstraintDomain}/${ConstraintVerb}/${string}`>;
  };
};
