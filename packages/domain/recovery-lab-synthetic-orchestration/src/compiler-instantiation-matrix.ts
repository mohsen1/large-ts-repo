import type { IntersectedEnvelope } from '@shared/type-level/stress-fabric-typegraph';
import { pluginHub } from '@shared/type-level/stress-plugin-hub';
import { buildSolverInput } from './compiler-advanced-stress-lab';

type Id<T extends string> = Brand<T, 'SyntheticId'>;

interface SyntheticEnvelope<T extends string> {
  readonly id: Id<T>;
  readonly version: `${number}.${number}.${number}`;
  readonly createdAt: Date;
}

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type SolverTemplate<
  TIn,
  TOut,
  TMeta extends Record<string, unknown>,
> = {
  readonly input: TIn;
  readonly output: TOut;
  readonly meta: TMeta & { readonly stamp: number };
};

export type MutuallyNested<
  TLeft,
  TRight,
  TGuard extends Record<string, unknown> = Record<string, unknown>,
> = TLeft extends TRight
  ? TRight extends TLeft
    ? {
        readonly left: TLeft;
        readonly right: TRight;
        readonly guard: TGuard;
        readonly both: true;
      }
    : never
  : never;

export type RecNest<T, N extends number> = N extends 0
  ? T
  : {
      readonly value: RecNest<T, Decrement<N>>;
    };
type Decrement<N extends number> = [...BuildRange<N>] extends [infer _, ...infer Tail] ? Tail['length'] : 0;
type BuildRange<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : BuildRange<N, [...T, unknown]>;

export type RouteMetaByKind<
  TKind extends 'recover' | 'restore' | 'analyze' | 'simulate' | 'audit',
  TInput,
  TOutput,
> = {
  readonly kind: TKind;
  readonly envelope: SyntheticEnvelope<TKind>;
  readonly payload: {
    readonly input: TInput;
    readonly output: TOutput;
    readonly chain: RecNest<TKind, 4>;
  };
};

export type ConstrainedDispatch<
  A extends string,
  B extends A,
  C extends Record<A, B>,
  D extends keyof C = keyof C,
  E extends C[D][] = C[D][],
> = {
  source: A;
  target: B;
  catalog: C;
  focus: D;
  values: E;
};

export type ConstraintInstances = {
  readonly a: ConstrainedDispatch<'forecast', 'forecast', { forecast: 'forecast' }>;
  readonly b: ConstrainedDispatch<'recovery', 'recovery', { recovery: 'recovery' }>;
  readonly c: ConstrainedDispatch<'policy', 'policy', { policy: 'policy' }>;
};

export type SolverFactory<
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = {
  kind: TKind;
  input: TInput;
  output: TOutput;
  meta: TMeta;
};

export type FactoryTuple<
  TKind extends string,
  TInput,
  TOutput,
  TMarker extends string = 'default',
> = readonly [
  SolverFactory<TKind, TInput, TOutput, { readonly marker: TMarker }>,
  SolverFactory<TKind, TInput, TOutput, { readonly marker: `marker-${TMarker}` }>,
];

export type IntersectedFactories = IntersectedFactorySuite & {
  readonly marker: BrandedRoute;
};
export type BrandedRoute = Brand<string, 'RouteRef'>;

export type IntersectedFactorySuite = SolverFactory<'bootstrap', never, never, { readonly level: 0 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 1 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 2 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 3 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 4 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 5 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 6 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 7 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 8 }> &
  SolverFactory<'bootstrap', never, never, { readonly level: 9 }>;

export const instantiateSolver = <
  TInput,
  TOutput,
  TKind extends string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
>(
  kind: TKind,
  input: TInput,
  output: TOutput,
  meta: TMeta,
): SolverFactory<TKind, TInput, TOutput, TMeta> => ({
  kind,
  input,
  output,
  meta: { ...meta, marker: kind },
});

export type InferenceSink<T> = T extends infer U ? (value: U) => U : never;

export const makeTuple = <T extends readonly SolverFactory<string, unknown, unknown, Record<string, unknown>>[]>(...values: T): T => values;

export const toEnvelope = <T extends string>(id: T): SyntheticEnvelope<T> => ({
  id: `${id}-id` as Id<T>,
  version: '1.0.0',
  createdAt: new Date(),
});

export const buildFactoryLattice = () => {
  const alpha = instantiateSolver('recover', { route: 'incident.discover.critical' }, 0, { marker: 'A' });
  const beta = instantiateSolver('restore', { route: 'incident.restore.low' }, 'ok', { marker: 'B' });
  const gamma = instantiateSolver('simulate', { route: 'workflow.simulate.low' }, 'done', { marker: 'C' });
  const delta = instantiateSolver('audit', { route: 'policy.audit.low' }, true, { marker: 'D' });
  const epsilon = instantiateSolver('assess', { route: 'incident.assess.low' }, { status: 'ok' }, { marker: 'E' });
  const zeta = instantiateSolver('scale', { route: 'mesh.scale.low' }, { size: 12 }, { marker: 'F' });
  const eta = instantiateSolver('triage', { route: 'incident.triage.low' }, { status: 'review' }, { marker: 'G' });
  const theta = instantiateSolver('route', { route: 'workflow.route.low' }, { route: 'ok' }, { marker: 'H' });
  const iota = instantiateSolver('rollback', { route: 'incident.rollback.low' }, { reverted: true }, { marker: 'I' });
  const tuple = makeTuple(alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota);
  return { alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota, tuple };
};

export const instantiateNested = <T extends BranchTemplate>(...items: readonly T[]): {
  readonly template: readonly T[];
  readonly snapshot: () => string[];
} => {
  const hub = pluginHub();
  for (const item of items) {
    hub.register({ id: item, token: `${item}-token` });
  }
  return {
    template: items,
    snapshot: hub.snapshot,
  };
};

export type BranchTemplate = 'alpha' | 'beta' | 'gamma' | 'delta';
export type BranchTemplateMap<T extends readonly BranchTemplate[]> = {
  [K in keyof T]: { readonly name: T[K]; readonly template: T[K] };
};

const tupleA = buildFactoryLattice();

const branchTemplateLiterals = ['alpha', 'beta', 'gamma', 'delta'] as const;

const buildTemplateMap = <T extends readonly BranchTemplate[]>(values: T): BranchTemplateMap<T> => {
  return values.map((entry) => ({
    name: entry,
    template: entry,
  })) as BranchTemplateMap<T>;
};

const mapped = buildTemplateMap(branchTemplateLiterals);

const chainA = instantiateNested('alpha', 'beta', 'gamma', 'delta');

export type SolverResult = ReturnType<typeof buildFactoryLattice>;
export type NestedResult = typeof mapped;
export type ChainResult = typeof chainA;

export const solveConstraint = <T extends string, U extends T>(
  left: T,
  right: U,
): ConstrainedDispatch<T, U, Record<T, U>> => {
  return {
    source: left,
    target: right,
    catalog: { [left]: right } as Record<T, U>,
    focus: left as keyof Record<T, U>,
    values: [right] as [U],
  };
};

export const solverInvocationSuite = async () => {
  const context = buildSolverInput([
    'incident.discover.critical',
    'telemetry.notify.warning',
    'workflow.restore.low',
  ] as const);
  const matrix = {
    base: context,
    routeTemplates: mapped,
    chain: chainA,
  };
  await using stack = new AsyncDisposableStack();
  stack.defer(async () => {
    await Promise.resolve(Object.keys(matrix.routeTemplates).length);
  });
  const checksum = matrix.base.trace.length + matrix.chain.template.length + branchTemplateLiterals.length;
  return { ...matrix, checksum };
};
