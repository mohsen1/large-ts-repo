export type RouteDomain =
  | 'atlas'
  | 'ops'
  | 'mesh'
  | 'drift'
  | 'slo'
  | 'drill'
  | 'telemetry'
  | 'policy'
  | 'studio'
  | 'signal'
  | 'continuity'
  | 'recovery'
  | 'incident'
  | 'forecast';

export type RouteVerb =
  | 'bootstrap'
  | 'open'
  | 'simulate'
  | 'triage'
  | 'stabilize'
  | 'rollback'
  | 'recover'
  | 'archive'
  | 'activate'
  | 'resolve'
  | 'audit';

export type RouteSeverity = 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'fatal' | 'extreme';

export type RouteAtom = `${RouteDomain}/${RouteVerb}/${RouteSeverity}/${string}`;

export type RouteChainPhase = 'open' | 'prepare' | 'repair' | 'undo' | 'close';

export const routePhase = (verb: RouteVerb): RouteChainPhase => {
  if (verb === 'bootstrap' || verb === 'activate') return 'open';
  if (verb === 'simulate' || verb === 'triage') return 'prepare';
  if (verb === 'rollback') return 'undo';
  if (verb === 'stabilize' || verb === 'recover' || verb === 'resolve') return 'repair';
  return 'close';
};

export type RouteParts<T extends RouteAtom> = T extends `${infer Domain}/${infer Verb}/${infer Severity}/${infer Identity}`
  ? Domain extends RouteDomain
    ? Verb extends RouteVerb
      ? Severity extends RouteSeverity
        ? {
            readonly domain: Domain;
            readonly verb: Verb;
            readonly severity: Severity;
            readonly identity: Identity;
            readonly marker: `${Domain}-${Verb}-${Severity}`;
          }
        : never
      : never
    : never
  : never;

export type SeverityScore<T extends RouteSeverity> = T extends 'low'
  ? 1
  : T extends 'medium'
    ? 2
    : T extends 'high'
      ? 4
      : T extends 'critical'
        ? 8
        : T extends 'emergency'
          ? 16
          : T extends 'fatal'
            ? 24
            : 32;

export type SeverityLabel<T extends RouteSeverity> = T extends 'low'
  ? 'L'
  : T extends 'medium'
    ? 'M'
    : T extends 'high'
      ? 'H'
      : T extends 'critical'
        ? 'C'
        : T extends 'emergency'
          ? 'E'
          : T extends 'fatal'
            ? 'F'
            : 'X';

export type RoutePolicy<T extends RouteAtom> = {
  readonly phase: RouteChainPhase;
  readonly score: number;
  readonly tag: string;
};

export type RouteResolution<T extends RouteAtom> = RouteParts<T> & RoutePolicy<T>;

export type PipelineTuple<T extends RouteAtom> = {
  readonly tuple: readonly [T, `${RouteVerb}-${RouteSeverity}`];
  readonly resolved: RouteResolution<T>;
};

type CounterTuple<T extends number, Acc extends unknown[] = []> = Acc['length'] extends T
  ? Acc
  : CounterTuple<T, [...Acc, unknown]>;
type Decrement<T extends number> = T extends 0 ? 0 : CounterTuple<T> extends [unknown, ...infer Rest] ? Rest['length'] : never;

export type BranchDispatch<T extends RouteAtom, K extends number = 8> = K extends 0
  ? {
      readonly depth: K;
      readonly route: PipelineTuple<T>;
    }
  : {
      readonly depth: K;
      readonly route: PipelineTuple<T>;
      readonly phase: RouteChainPhase;
      readonly next: BranchDispatch<T, Decrement<K>>;
    };

export type RouteChain<T extends readonly RouteAtom[], K extends number = 8> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends RouteAtom
  ? BranchDispatch<Head, K> & { readonly tail: Tail extends readonly RouteAtom[] ? RouteChain<Tail, K> : never }
  : never
  : never;

export type ParsedRouter = {
  readonly index: number;
  readonly value: string;
};

export type ParsedIndex<T extends readonly RouteAtom[]> = {
  [K in keyof T]: K extends number ? { readonly cursor: K; readonly route: T[K]; readonly parsed: RouteParts<T[K]> } : never;
};

export type GalaxyCatalog =
  | 'atlas/bootstrap/high/seed'
  | 'ops/simulate/critical/sample'
  | 'telemetry/archive/critical/report'
  | 'drill/recover/fatal/final'
  | 'studio/stabilize/high/window'
  | 'mesh/triage/high/mesh-zone'
  | 'policy/activate/low/policy-1'
  | 'slo/recover/medium/slo-window'
  | 'forecast/resolve/extreme/forecast-a'
  | 'signal/audit/high/sig-1'
  | 'continuity/recover/high/continuity-a'
  | 'incident/bootstrap/critical/incident-a'
  | 'recovery/rollback/fatal/recover-a'
  | 'recovery/activate/high/recovery-a'
  | 'drift/simulate/medium/drift-a'
  | 'drift/archive/low/drift-b'
  | 'drift/stabilize/extreme/drift-c'
  | 'drift/recover/medium/drift-d'
  | 'drill/bootstrap/critical/drill-a'
  | 'policy/archive/fatal/policy-a'
  | 'telemetry/archive/low/telemetry-a'
  | 'forecast/bootstrap/high/forecast-x'
  | 'forecast/activate/critical/forecast-y'
  | 'signal/resolve/extreme/signal-z'
  | 'slo/simulate/emergency/slo-y'
  | 'studio/archive/low/studio-a'
  | 'incident/open/beta/recheck'
  | 'ops/archive/extreme/ops-a'
  | 'mesh/open/extreme/mesh-b';

export const severityScore = <T extends RouteSeverity>(severity: T): SeverityScore<T> => {
  if (severity === 'low') return 1 as SeverityScore<T>;
  if (severity === 'medium') return 2 as SeverityScore<T>;
  if (severity === 'high') return 4 as SeverityScore<T>;
  if (severity === 'critical') return 8 as SeverityScore<T>;
  if (severity === 'emergency') return 16 as SeverityScore<T>;
  if (severity === 'fatal') return 24 as SeverityScore<T>;
  return 32 as SeverityScore<T>;
};

export const severityLabel = <T extends RouteSeverity>(severity: T): SeverityLabel<T> => {
  if (severity === 'low') return 'L' as SeverityLabel<T>;
  if (severity === 'medium') return 'M' as SeverityLabel<T>;
  if (severity === 'high') return 'H' as SeverityLabel<T>;
  if (severity === 'critical') return 'C' as SeverityLabel<T>;
  if (severity === 'emergency') return 'E' as SeverityLabel<T>;
  if (severity === 'fatal') return 'F' as SeverityLabel<T>;
  return 'X' as SeverityLabel<T>;
};

export const parseRouteAtom = <T extends RouteAtom>(value: T): RouteParts<T> => {
  const [domain, verb, severity, identity] = value.split('/') as [RouteDomain, RouteVerb, RouteSeverity, string];
  return {
    domain,
    verb,
    severity,
    identity,
    marker: `${domain}-${verb}-${severity}`,
  } as RouteParts<T>;
};

export const buildPipelineTuple = <T extends RouteAtom>(value: T): PipelineTuple<T> => {
  const parts = parseRouteAtom(value);
  return {
    tuple: [value, `${parts.verb}-${parts.severity}`],
    resolved: {
      ...parts,
      phase: routePhase(parts.verb),
      score: severityScore(parts.severity),
      tag: `${severityLabel(parts.severity)}-${parts.domain}-${parts.identity}`,
    } as RouteResolution<T>,
  };
};

export const routeSet: readonly RouteAtom[] = [
  'atlas/bootstrap/high/seed',
  'ops/simulate/critical/sample',
  'telemetry/archive/critical/report',
  'drill/recover/fatal/final',
  'studio/stabilize/high/window',
  'mesh/triage/high/mesh-zone',
  'policy/activate/low/policy-1',
  'slo/recover/medium/slo-window',
  'forecast/resolve/extreme/forecast-a',
  'signal/audit/high/sig-1',
  'continuity/recover/high/continuity-a',
  'incident/open/low/recheck',
  'incident/bootstrap/critical/incident-a',
  'recovery/rollback/fatal/recover-a',
  'recovery/activate/high/recovery-a',
  'drift/simulate/medium/drift-a',
  'drift/archive/low/drift-b',
  'drift/stabilize/extreme/drift-c',
  'drift/recover/medium/drift-d',
  'drill/bootstrap/critical/drill-a',
  'policy/archive/fatal/policy-a',
  'telemetry/archive/low/telemetry-a',
  'forecast/bootstrap/high/forecast-x',
  'forecast/activate/critical/forecast-y',
  'signal/resolve/extreme/signal-z',
  'slo/simulate/emergency/slo-y',
  'studio/archive/low/studio-a',
  'ops/archive/extreme/ops-a',
  'mesh/open/extreme/mesh-b',
] as const satisfies readonly RouteAtom[];

export const resolveAtlasRoutes = <T extends readonly RouteAtom[]>(values: T): ParsedIndex<T> =>
  values.map((value, index) => ({
    cursor: index,
    route: value,
    parsed: parseRouteAtom(value),
  })) as ParsedIndex<T>;

export const chainResolver = <T extends readonly RouteAtom[]>(input: T): RouteChain<T> =>
  input.reduce<Record<number, ParsedRouter>>((acc, current, index) => {
    const value = current as RouteAtom;
    const [domain, verb, severity, identity] = value.split('/');
    acc[index] = {
      index,
      value: `${domain}/${verb}/${severity}/${identity}`,
    };
    return acc;
  }, {}) as unknown as RouteChain<T>;

export type RouteMap = Record<RouteAtom, { domain: RouteDomain; phase: RouteChainPhase; score: number; tag: string }>;

export const catalog = routeSet.reduce<RouteMap>((acc, route) => {
  const parsed = parseRouteAtom(route);
  acc[route] = {
    domain: parsed.domain,
    phase: routePhase(parsed.verb),
    score: severityScore(parsed.severity),
    tag: `${parsed.severity}:${parsed.domain}`,
  };
  return acc;
}, {} as RouteMap);

export type GalaxyRemap<T extends Record<string, RouteAtom>> = {
  [K in keyof T as K extends string ? `${K}-mapped` : never]: T[K] extends RouteAtom ? PipelineTuple<T[K]> : never;
};

export type GalaxyRemapCatalog = {
  [K in `slot-${number}`]: PipelineTuple<RouteAtom>;
};

export const buildGalaxyMap = (count: number): GalaxyRemapCatalog => {
  const output = {} as GalaxyRemapCatalog;
  for (let index = 0; index < count; index += 1) {
    output[`slot-${index}`] = buildPipelineTuple(routeSet[index % routeSet.length]);
  }
  return output;
};

export type RouteChainFold<T extends readonly RouteAtom[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends RouteAtom
    ? { readonly head: RouteResolution<Head>; readonly headTuple: PipelineTuple<Head>; readonly tail: Tail extends readonly RouteAtom[] ? RouteChainFold<Tail> : never }
    : never
  : never;

export type GalaxyBranch<T extends RouteAtom> = RouteResolution<T> & {
  readonly token: `${string}-${string}-${string}-${string}`;
  readonly weight: number;
};

export const resolveGalaxyBranches = (input: readonly RouteAtom[]): readonly GalaxyBranch<RouteAtom>[] => {
  return input.map((entry) => {
    const parsed = parseRouteAtom(entry);
    return {
      ...parsed,
      phase: routePhase(parsed.verb),
      score: severityScore(parsed.severity),
      tag: `${severityLabel(parsed.severity)}-${parsed.domain}-${parsed.identity}`,
      token: `${parsed.domain}-${parsed.verb}-${parsed.severity}-${parsed.identity}`,
      weight: severityScore(parsed.severity),
    } as GalaxyBranch<RouteAtom>;
  });
};

export const normalizeAtlasBranch = (input: readonly RouteAtom[]): {
  readonly index: Record<string, string>;
  readonly matrix: unknown;
  readonly branches: readonly GalaxyBranch<RouteAtom>[];
} => {
  const index: Record<string, string> = {};
  const branches = resolveGalaxyBranches(input);
  for (const [at] of Object.entries(branches)) {
    index[`resolved-${at}`] = branches[Number(at)]?.tag;
  }
  return {
    index,
    matrix: chainResolver(routeSet) as unknown,
    branches,
  };
};

type DispatchNode = {
  readonly head: RouteResolution<RouteAtom>;
  readonly headTuple: PipelineTuple<RouteAtom>;
  readonly tail: DispatchNode | 'end';
};

export const recursiveDispatchSafe = (count: number, input: RouteAtom): DispatchNode => {
  if (count <= 0) {
    return {
      head: buildPipelineTuple(input).resolved,
      headTuple: buildPipelineTuple(input),
      tail: 'end',
    };
  }
  return {
    head: buildPipelineTuple(input).resolved,
    headTuple: buildPipelineTuple(input),
    tail: recursiveDispatchSafe(count - 1, input),
  };
};

export const recursiveDispatch = recursiveDispatchSafe;
