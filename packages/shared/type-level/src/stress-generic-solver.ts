import type { NoInfer } from './patterns';

export type LabSolverVerb =
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
  | 'audit-trace';

export type LabSolverInput<Verb extends LabSolverVerb, Domain extends string, Marker extends string> = {
  readonly verb: Verb;
  readonly domain: Domain;
  readonly marker: Marker;
  readonly payload: {
    readonly source: Domain;
    readonly id: `${Verb}-${Marker}`;
  };
};

export type LabSolverOutput<Verb extends LabSolverVerb> = Verb extends 'discover' | 'ingest' | 'materialize'
  ? { readonly kind: 'ok'; readonly verb: Verb; readonly stage: 1 }
  : Verb extends 'validate' | 'reconcile' | 'synthesize'
    ? { readonly kind: 'ok'; readonly verb: Verb; readonly stage: 2 }
    : Verb extends 'snapshot' | 'restore'
      ? { readonly kind: 'warn'; readonly verb: Verb; readonly stage: 3; readonly reason: string }
      : Verb extends 'simulate' | 'inject' | 'amplify'
        ? { readonly kind: 'ok'; readonly verb: Verb; readonly stage: 4; readonly metrics: number }
        : Verb extends 'throttle' | 'rebalance' | 'reroute' | 'contain'
          ? { readonly kind: 'warn'; readonly verb: Verb; readonly stage: 5; readonly pressure: number }
          : Verb extends 'recover' | 'observe' | 'drill'
            ? { readonly kind: 'ok'; readonly verb: Verb; readonly stage: 6; readonly recovered: boolean }
            : Verb extends 'audit' | 'telemetry' | 'dispatch'
              ? { readonly kind: 'ok'; readonly verb: Verb; readonly stage: 7; readonly traced: true }
              : { readonly kind: 'err'; readonly verb: Verb; readonly stage: 8; readonly failed: true };

export type LabSolverProfile<Verb extends LabSolverVerb, Domain extends string, Marker extends string> = {
  readonly verb: Verb;
  readonly domain: Domain;
  readonly marker: Marker;
  readonly token: `${Verb}:${Domain}`;
  readonly tags: readonly Marker[];
  readonly constraints: {
    readonly input: LabSolverInput<Verb, Domain, Marker>;
    readonly output: LabSolverOutput<Verb>;
  };
};

export type LabSolverInputPack<T extends readonly LabSolverVerb[]> = { [K in keyof T]: LabSolverInput<T[K], string, string> };
export type LabSolverOutputPack<T extends readonly LabSolverVerb[]> = { [K in keyof T]: LabSolverOutput<T[K]> };
type MutableLabSolverOutputPack<T extends readonly LabSolverVerb[]> = { -readonly [K in keyof T]: LabSolverOutput<T[K]> };
export type LabSolverConstraint<TVerb extends LabSolverVerb> = TVerb extends 'discover'
  ? `c:${TVerb}`
  : TVerb extends 'validate' | 'reconcile'
    ? `c:policy`
    : `c:general`;

export function buildLabSolver<TVerb extends LabSolverVerb>(verb: TVerb): LabSolverConstraint<TVerb> {
  return `c:${verb}` as LabSolverConstraint<TVerb>;
}

export function solve<Verb extends LabSolverVerb, Domain extends string, Marker extends string>(
  options: LabSolverProfile<Verb, Domain, Marker>,
): LabSolverOutput<Verb> {
  const base = {
    kind: 'ok',
    verb: options.verb,
    stage: 1,
  } as LabSolverOutput<Verb>;
  return options.marker ? base : base;
}

export function solveWithMetric<
  Verb extends LabSolverVerb,
  Domain extends string,
  Marker extends string,
  Metric extends number,
>(options: LabSolverProfile<Verb, Domain, Marker> & { readonly metric: Metric }): Metric extends 0
  ? LabSolverOutput<'discover'>
  : LabSolverOutput<Verb> {
  return solve(options) as Metric extends 0 ? LabSolverOutput<'discover'> : LabSolverOutput<Verb>;
}

export function solveBatch<const Verbs extends readonly LabSolverVerb[]>(
  verbs: Verbs,
  domain: string,
  marker: string,
): LabSolverOutputPack<Verbs> {
  const outputs: MutableLabSolverOutputPack<Verbs> = [] as MutableLabSolverOutputPack<Verbs>;
  for (const [index, verb] of verbs.entries()) {
    const profile: LabSolverProfile<typeof verb & LabSolverVerb, string, string> = {
      verb,
      domain,
      marker,
      token: `${verb}:${domain}`,
      tags: [marker],
      constraints: {
        input: {
          verb,
          domain,
          marker,
          payload: { source: domain, id: `${verb}-${marker}` },
        },
        output: solve({
          verb,
          domain,
          marker,
          token: `${verb}:${domain}`,
          tags: [marker],
          constraints: {
            input: { verb, domain, marker, payload: { source: domain, id: `${verb}-${marker}` } },
            output: { kind: 'warn', verb, stage: 3, reason: 'baseline' } as LabSolverOutput<typeof verb>,
          },
        }),
      },
    };
    outputs[index as keyof Verbs] = solve(profile) as MutableLabSolverOutputPack<Verbs>[keyof Verbs];
  }
  return outputs as LabSolverOutputPack<Verbs>;
}

export function solveBatchWithNoInfer<
  Verbs extends readonly LabSolverVerb[],
  Metric extends number,
>(
  verbs: Verbs,
  domain: NoInfer<string>,
  marker: NoInfer<string>,
  metric: Metric,
): LabSolverOutputPack<Verbs> {
  const outputs = solveBatch(verbs, domain, marker);
  for (const verb of verbs) {
    const profile: LabSolverProfile<typeof verb & LabSolverVerb, string, string> = {
      verb,
      domain,
      marker,
      token: `${verb}:${domain}`,
      tags: [marker],
      constraints: {
        input: {
          verb,
          domain,
          marker,
          payload: { source: domain, id: `${verb}-${marker}` },
        },
        output: {
          kind: 'ok',
          verb,
          stage: 1,
          traced: true,
        } as unknown as LabSolverOutput<typeof verb>,
      },
    };
    const output = metric > 0 ? solve(profile) : solve(profile);
    (outputs as MutableLabSolverOutputPack<Verbs>)[verbs.indexOf(verb)] = output as MutableLabSolverOutputPack<Verbs>[number];
  }
  return outputs as LabSolverOutputPack<Verbs>;
}

export const solverFactories = [
  <Verb extends LabSolverVerb>(verb: Verb) => (domain: string) =>
    (marker: string) =>
      solve({
        verb,
        domain,
        marker,
        token: `${verb}:${domain}`,
        tags: [marker],
        constraints: {
          input: {
            verb,
            domain,
            marker,
            payload: { source: domain, id: `${verb}-${marker}` },
          },
        output: {
            kind: 'warn',
            verb,
            stage: 3,
            reason: `${verb}.seed`,
          } as unknown as LabSolverOutput<Verb>,
        },
      }),
  <Verb extends LabSolverVerb>(verb: Verb) => (domain: string) => (payload: string) =>
    ({ verb, domain, stage: 2, kind: 'warn', reason: payload } as unknown as LabSolverOutput<Verb>),
  <Verb extends LabSolverVerb>(verb: Verb) => (domain: string) => (metric: number) =>
    ({ verb, kind: 'ok', stage: 1, payload: { domain, metric } } as unknown as LabSolverOutput<Verb>),
] as const;

export type SolverFactory = typeof solverFactories[number];
export type SolverFactoryResult<T extends SolverFactory> = T extends (...args: any[]) => any ? ReturnType<T> : never;

export const runStressSolverSuite = () => {
  const first = solve({
    verb: 'discover',
    domain: 'agent',
    marker: 'alpha',
    token: 'discover:agent',
    tags: ['alpha'],
    constraints: {
      input: { verb: 'discover', domain: 'agent', marker: 'alpha', payload: { source: 'agent', id: 'discover-alpha' } },
      output: { kind: 'ok', verb: 'discover', stage: 1 },
    },
  });
  const second = solveWithMetric({
    verb: 'validate',
    domain: 'policy',
    marker: 'bravo',
    token: 'validate:policy',
    tags: ['bravo'],
    metric: 8,
    constraints: {
      input: { verb: 'validate', domain: 'policy', marker: 'bravo', payload: { source: 'policy', id: 'validate-bravo' } },
      output: { kind: 'ok', verb: 'validate', stage: 2 },
    },
  });
  const third = solveBatch(
    ['discover', 'ingest', 'materialize', 'validate', 'reconcile', 'synthesize'],
    'mesh',
    'charlie',
  );
  const fourth = solveBatchWithNoInfer(
    ['audit', 'telemetry', 'dispatch', 'drill', 'recover', 'observe', 'stabilize', 'floodfill'],
    'agent',
    'delta',
    1,
  );
  const direct = solverFactories[0]!('load-shed')('agent')('echo');
  const fallback = solverFactories[1]!('route-fallback')('policy')('route');
  const weighted = solverFactories[2]!('topology-drift')('dispatch')(42);
  return { first, second, third, fourth, direct, fallback, weighted };
};
