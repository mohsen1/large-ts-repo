export type NoInfer<T> = [T][T extends any ? 0 : never];

export type SolverDomain = 'runtime' | 'policy' | 'telemetry' | 'workflow' | 'security';
export type SolverVerb = 'prepare' | 'plan' | 'execute' | 'verify' | 'rollback' | 'observe' | 'enforce' | 'finalize';
export type SolverSeverity = 'low' | 'medium' | 'high' | 'critical';

export type Branded<T, B extends string> = T & { readonly __brand: B };

export type SolverToken<T extends string> = Branded<T, 'SolverToken'>;

export type SolverPayload<TDomain extends SolverDomain, TVerb extends SolverVerb> = {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly payload: string;
  readonly issuedAt: number;
};

export type ConstraintSource = {
  readonly name: string;
  readonly level: number;
};

export type ConstraintCell<TDomain extends SolverDomain, T extends ReadonlyArray<ConstraintSource>> = {
  readonly domain: TDomain;
  readonly chain: T;
  readonly requiredBy: ReadonlyArray<SolverToken<string>>;
};

export type ConstraintMap<T extends ReadonlyArray<ConstraintSource>> = {
  [P in T[number] as P['name']]: {
    readonly minLevel: P['level'];
    readonly stable: P['level'] extends 0 ? false : true;
  };
};

export type ChainConstraint<A extends SolverDomain, B extends SolverDomain, C extends Record<string, A>> =
  B extends A ? (A extends keyof C ? { readonly cycle: true } : never) : { readonly cycle: false; readonly domain: B };

export type SolverGraph<A extends SolverDomain, B extends SolverDomain, C extends Record<SolverToken<string>, A>> =
  [A, B] extends [any, any]
    ? ChainConstraint<A, B, C>
    : never;

export type ConstraintEnvelope<
  TDomain extends SolverDomain,
  TVerb extends SolverVerb,
  TSource extends ConstraintSource,
> = {
  readonly token: SolverToken<`${TDomain}:${TVerb}:${TSource['name']}`>;
  readonly scope: TDomain;
  readonly verb: TVerb;
  readonly level: TSource['level'];
  readonly source: TSource;
};

export type ConstraintPlan<T extends readonly ConstraintSource[]> =
  T extends readonly [infer Head extends ConstraintSource, ...infer Tail extends ConstraintSource[]]
    ? readonly [
        ConstraintEnvelope<'runtime', 'prepare', Head>,
        ...ConstraintPlan<Tail>
      ]
    : readonly [];

export type ConstraintResolution<Envelope extends ConstraintEnvelope<SolverDomain, SolverVerb, ConstraintSource>> =
  Envelope['level'] extends 0
    ? 'ignore'
    : Envelope['level'] extends 1
      ? 'defer'
      : Envelope['level'] extends 2
        ? 'review'
        : Envelope['level'] extends 3
          ? 'execute'
          : 'block';

export type SolverEnvelope<A extends SolverDomain, B extends SolverVerb> = {
  readonly domain: A;
  readonly verb: B;
  readonly constraints: ConstraintPlan<readonly [
    { name: `${A}-seed`; level: 1 },
    { name: `${A}-link`; level: 2 },
    { name: `${A}-root`; level: 3 },
  ]>;
  readonly status: B extends 'rollback' | 'finalize' ? 'closing' : 'active';
};

export function configureSolver<TDomain extends SolverDomain>(domain: NoInfer<TDomain>): ConstraintEnvelope<TDomain, 'prepare', ConstraintSource>;
export function configureSolver<TDomain extends SolverDomain, TVerb extends SolverVerb>(domain: NoInfer<TDomain>, verb: NoInfer<TVerb>): ConstraintEnvelope<TDomain, TVerb, ConstraintSource>;
export function configureSolver<TDomain extends SolverDomain, TVerb extends SolverVerb, TSource extends ConstraintSource>(
  domain: NoInfer<TDomain>,
  verb: NoInfer<TVerb>,
  source: NoInfer<TSource>,
  severity?: NoInfer<SolverSeverity>,
): ConstraintEnvelope<TDomain, TVerb, TSource>;
export function configureSolver<TDomain extends SolverDomain, TVerb extends SolverVerb, TSource extends ConstraintSource>(
  domain: NoInfer<TDomain>,
  verb: NoInfer<TVerb> = 'prepare' as NoInfer<TVerb>,
  source: NoInfer<TSource> = { name: `${domain}-default`, level: 1 } as NoInfer<TSource>,
  severity: NoInfer<SolverSeverity> = 'low',
): ConstraintEnvelope<TDomain, TVerb, TSource> {
  return {
    token: `${domain}:${String(verb)}:${source.name}` as SolverToken<`${TDomain}:${TVerb}:${TSource['name'] & string}`>,
    scope: domain,
    verb,
    level: source.level,
    source,
  } as ConstraintEnvelope<TDomain, TVerb, TSource>;
}

export const resolveConstraintChain = <
  const TDomain extends SolverDomain,
  const TVerb extends SolverVerb,
>(domain: NoInfer<TDomain>, verb: NoInfer<TVerb>) => {
  const sources: readonly ConstraintSource[] = [
    { name: `${domain}:seed`, level: 1 },
    { name: `${domain}:validation`, level: 2 },
    { name: `${domain}:hardening`, level: 3 },
    { name: `${domain}:execution`, level: 4 },
  ];
  const resolved = sources.map((source) => {
    const envelope = configureSolver(domain, verb, source, source.level === 4 ? 'critical' : 'medium');
    const status = resolveConstraintStatus(envelope);
    return { envelope, status };
  });

  const map = new Map(resolved.map((entry) => [entry.envelope.token, entry.status]));
  return {
    domain,
    verb,
    items: resolved,
    plan: buildConstraintPlan(sources),
    map,
    summary: resolved.reduce(
      (memo, entry) => {
        memo.total += 1;
        memo.levelTotal += entry.envelope.level;
        const status = entry.status as 'ignore' | 'defer' | 'review' | 'execute' | 'block';
        memo.critical += status === 'execute' ? 1 : 0;
        return memo;
      },
      { total: 0, levelTotal: 0, critical: 0 },
    ),
    ratio: resolved.reduce((memo, entry) => memo + entry.envelope.level, 0) / Math.max(1, resolved.length),
    trace: resolved.map((entry) => `${entry.envelope.scope}:${entry.envelope.verb}:${entry.status}`),
  } as const;
};

export const buildConstraintPlan = <T extends readonly ConstraintSource[]>(sources: T): ConstraintPlan<T> => {
  const plan = sources.map((source, index) => ({
    token: `${source.name}:${index}` as SolverToken<`${string}:${number}`>,
    scope: 'runtime' as const,
    verb: 'prepare' as const,
    level: source.level,
    source,
  })) as unknown as ConstraintPlan<T>;
  return plan;
};

export const resolveConstraintStatus = <
  const TDomain extends SolverDomain,
  const TVerb extends SolverVerb,
>(
  envelope: ConstraintEnvelope<TDomain, TVerb, ConstraintSource>,
): ConstraintResolution<typeof envelope> | 'block' => {
  const map: Record<SolverSeverity, 'ignore' | 'defer' | 'review' | 'execute' | 'block'> = {
    low: 'ignore',
    medium: 'defer',
    high: 'review',
    critical: 'execute',
  };
  const severity = envelope.level >= 3 ? 'critical' : envelope.level >= 2 ? 'high' : envelope.level === 1 ? 'medium' : 'low';
  return map[severity] as ConstraintResolution<typeof envelope>;
};

export const solverTrace = <
  const TDomain extends SolverDomain,
  const TVerb extends SolverVerb,
>(domain: NoInfer<TDomain>, verb: NoInfer<TVerb>) => {
  const chain = resolveConstraintChain(domain, verb);
  const summary = chain.items.reduce(
    (memo, entry) => {
      memo.total += 1;
      memo.levelTotal += entry.envelope.level;
      const status = entry.status as 'ignore' | 'defer' | 'review' | 'execute' | 'block';
      memo.critical += status === 'execute' ? 1 : 0;
      return memo;
    },
    { total: 0, levelTotal: 0, critical: 0 },
  );

  return {
    ...chain,
    summary,
    ratio: summary.levelTotal / Math.max(1, summary.total),
    trace: chain.items.map((entry) => `${entry.envelope.scope}:${entry.envelope.verb}:${entry.status}`),
  };
};
