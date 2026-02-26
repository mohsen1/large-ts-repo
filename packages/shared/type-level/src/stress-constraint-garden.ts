import { NoInfer, RecursivePath, Brand } from './patterns';

export type SolverInputDomain = 'alpha' | 'beta' | 'gamma' | 'delta' | 'epsilon';
export type SolverVerb = 'collect' | 'normalize' | 'dispatch' | 'observe' | 'resolve' | 'finalize';
export type SolverVerbToken = `${SolverInputDomain}:${SolverVerb}`;

export type NominalSolver<T extends string> = Brand<T, 'nominal-solver'>;

export type SolverPlan<T extends string> = Readonly<{
  readonly name: NominalSolver<`${SolverInputDomain}:${T}`>;
  readonly domain: SolverInputDomain;
  readonly verbs: readonly SolverVerb[];
  readonly createdAt: number;
}>;

export type SolverConstraintMap<T extends SolverInputDomain> = {
  [K in SolverVerb]: {
    readonly verb: `${T}:${K}`;
    readonly domain: T;
    readonly level: K extends 'collect'
      ? 1
      : K extends 'normalize'
        ? 2
        : K extends 'dispatch'
          ? 3
          : K extends 'observe'
            ? 4
            : K extends 'resolve'
              ? 5
              : 6;
  };
};

export type SolverConstraintTuple<A extends SolverPlan<string>, B extends SolverPlan<string>, C extends Record<string, SolverPlan<string>>> = [
  A & { readonly marker: 'a' },
  B & { readonly marker: 'b' },
  {
    readonly catalog: C;
    readonly a: A;
    readonly b: B;
  },
];

export type SolverDispatch<A extends SolverPlan<string>, B extends SolverPlan<string>, C extends Record<string, SolverPlan<string>>> = {
  readonly left: A & { readonly marker: 'a' };
  readonly right: B & { readonly marker: 'b' };
  readonly conflicts: C;
  readonly domain: A['domain'];
  readonly routes: SolverConstraintTuple<A, B, C>;
};

export type SolverConstraintInput<T extends SolverPlan<string>> = {
  readonly input: T;
  readonly path: RecursivePath<T>;
};

export type SolverConstraintOutput<T extends SolverPlan<string>> = {
  readonly accepted: SolverConstraintInput<T>[];
  readonly blocked: SolverConstraintInput<T>[];
  readonly constraints: Partial<SolverConstraintMap<T['domain']>>;
};

export interface SolverConstraintRegistry<T extends SolverPlan<string>> {
  readonly domain: T['domain'];
  readonly add: (entry: NoInfer<T>) => void;
  readonly flush: () => SolverConstraintOutput<T>;
}

export function createSolverConstraint<TName extends string, TDomain extends SolverInputDomain>(
  name: TName,
  domain: TDomain,
): SolverPlan<TName> {
  return {
    name: `${domain}:${name}` as NominalSolver<`${SolverInputDomain}:${TName}`>,
    domain,
    verbs: ['collect', 'normalize', 'dispatch'],
    createdAt: Date.now(),
  };
}

export function registerConstraintPlan<TName extends string, TDomain extends SolverInputDomain, TPlan extends SolverPlan<TName>>(
  plan: TPlan & NoInfer<{ readonly domain: TDomain }>,
  config: {
    readonly required: readonly SolverVerb[];
    readonly optional?: readonly SolverVerb[];
  },
): SolverConstraintOutput<TPlan> {
  const requiredConstraint = config.required.map((verb) => ({ verb, valid: true }));
  const optionalConstraint = (config.optional ?? []).map((verb) => ({ verb, valid: false }));

  return {
    accepted: requiredConstraint.map((entry) => ({
      input: plan,
      path: `${plan.name}.${entry.verb}` as RecursivePath<TPlan>,
    })),
    blocked: optionalConstraint.map((entry) => ({
      input: plan,
      path: `${plan.name}.${entry.verb}` as RecursivePath<TPlan>,
    })),
    constraints: {
      collect: {
        verb: `${plan.domain}:collect`,
        domain: plan.domain,
        level: 1,
      },
      normalize: {
        verb: `${plan.domain}:normalize`,
        domain: plan.domain,
        level: 2,
      },
    },
  };
}

export function resolveSolverConflict<
  A extends SolverPlan<string>,
  B extends SolverPlan<string> & { readonly domain: A['domain'] },
  C extends Record<string, SolverPlan<string>>,
>(
  left: A,
  right: B,
  catalog: C,
): SolverDispatch<A, B, C> {
  return {
    left: { ...left, marker: 'a' },
    right: { ...right, marker: 'b' },
    conflicts: catalog,
    domain: left.domain,
    routes: [
      { ...left, marker: 'a' },
      { ...right, marker: 'b' },
      { catalog, a: left, b: right },
    ],
  };
}

export function runSolverConflict<
  A extends SolverPlan<string>,
  B extends SolverPlan<string> & { readonly domain: A['domain'] },
  C extends Record<string, SolverPlan<string>>,
>(left: A, right: B, catalog: NoInfer<C>) {
  return resolveSolverConflict(left as A, right as B & { readonly domain: A['domain'] }, catalog);
}

export function solveSolverConstraints(
  ...entries: readonly SolverPlan<string>[]
): SolverConstraintOutput<SolverPlan<string>> {
  const first = entries[0];
  const base: SolverConstraintOutput<SolverPlan<string>> = {
    accepted: [],
    blocked: [],
    constraints: {
      collect: { verb: `${first?.domain ?? 'alpha'}:collect`, domain: first?.domain ?? 'alpha', level: 1 },
      normalize: { verb: `${first?.domain ?? 'alpha'}:normalize`, domain: first?.domain ?? 'alpha', level: 2 },
      dispatch: { verb: `${first?.domain ?? 'alpha'}:dispatch`, domain: first?.domain ?? 'alpha', level: 3 },
      observe: { verb: `${first?.domain ?? 'alpha'}:observe`, domain: first?.domain ?? 'alpha', level: 4 },
      resolve: { verb: `${first?.domain ?? 'alpha'}:resolve`, domain: first?.domain ?? 'alpha', level: 5 },
      finalize: { verb: `${first?.domain ?? 'alpha'}:finalize`, domain: first?.domain ?? 'alpha', level: 6 },
    },
  };

  for (const entry of entries) {
    base.accepted.push({
      input: entry,
      path: `${entry.name}.${entry.verbs[0]}` as RecursivePath<SolverPlan<string>>,
    });
  }

  return base;
}

export function checkSolverPlan<T extends SolverPlan<string>>(
  plan: T,
): plan is T & { readonly verbs: readonly ['collect', 'normalize', ...SolverVerb[]] } {
  return plan.verbs.includes('collect');
}

export function assertNominalSolver<T extends string>(value: string): asserts value is NominalSolver<T> {
  if (!value.includes(':')) {
    throw new Error('invalid nominal value');
  }
}

export function collectSolverConstraints(
  ...inputs: readonly [SolverInputDomain, SolverInputDomain, ...SolverInputDomain[]]
): {
  readonly first: SolverInputDomain;
  readonly second: SolverInputDomain;
  readonly extras: SolverInputDomain[];
} {
  const [first, second, ...extras] = inputs;
  return { first, second, extras };
}

export function buildConstraintLattice(
  domain: SolverInputDomain,
): ReturnType<typeof collectSolverConstraints> {
  return collectSolverConstraints(domain, domain, 'beta', 'gamma', 'delta') as ReturnType<typeof collectSolverConstraints>;
}

export const solverConstraintSeed = {
  name: 'incident:dispatch' as NominalSolver<`${SolverInputDomain}:${'dispatch'}`>,
  domain: 'alpha',
  verbs: ['collect', 'normalize', 'dispatch', 'observe', 'resolve'],
  createdAt: 1700000000000,
  kind: 'seed',
} satisfies SolverPlan<'dispatch'> & { kind: 'seed' | 'warm' };
