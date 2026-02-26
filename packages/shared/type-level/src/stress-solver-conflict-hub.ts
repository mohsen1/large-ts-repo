import type { NoInfer } from './patterns';

export type Branded<T, B extends string> = T & { readonly __brand: B };

export interface SolverContext {
  readonly tenant: string;
  readonly runbook: string;
  readonly priority: number;
}

export interface SolverPayload<T extends string = string> {
  readonly kind: T;
  readonly domain: string;
  readonly value: Branded<string, 'SolverValue'>;
}

export interface SolverResult<T extends string, TOutput = unknown> {
  readonly kind: T;
  readonly output: TOutput;
  readonly ok: boolean;
  readonly correlation: Branded<string, 'Correlation'>;
}

export interface SolverFactory<TKind extends string, TInput, TOutput, TConstraints extends object> {
  readonly kind: TKind;
  readonly input: TInput;
  readonly output: TOutput;
  readonly constraints: TConstraints;
  readonly createdAt: number;
}

export type ConstraintAware<T> =
  T extends { kind: infer K }
    ? K extends string
      ? K & (`constraint-${Lowercase<K & string>}`)
      : never
    : never;

export type ConstraintGraph<C extends string[]> = {
  readonly constraints: C;
  readonly depth: C['length'];
};

export type InterdependentConstraint<A extends string, B extends string, C extends Record<string, unknown>> =
  A extends `${infer Prefix}:${infer Rest}`
    ? B extends `${Prefix}:${infer RestB}`
      ? C extends Record<RestB, unknown>
        ? true
        : false
      : false
    : false;

export type ConstraintFactory<
  A extends string,
  B extends string,
  C extends Record<string, unknown>,
  F extends string,
> = {
  readonly a: A;
  readonly b: B;
  readonly c: C;
  readonly flow: boolean;
  readonly fallback: F;
};

export type SolverSignature =
  | ConstraintFactory<'discover:incident', 'discover:incident', Record<string, number>, 'fast'>
  | ConstraintFactory<'assess:workload', 'assess:workload', { workload: number }, 'safe'>
  | ConstraintFactory<'simulate:forecast', 'simulate:forecast', { windows: number }, 'deep'>
  | ConstraintFactory<'rollback:service', 'rollback:service', { risk: number }, 'hard'>
  | ConstraintFactory<'archive:log', 'archive:log', { ttl: number }, 'dry'>;

export type ResolveConstraint<T extends SolverSignature> = T['fallback'];

export interface SolverOverload {
  <Kind extends string, Input, Output>(
    kind: Kind,
    input: Input,
    output: Output,
    constraints: NoInfer<Record<string, unknown>>,
  ): SolverFactory<Kind, Input, Output, Record<string, unknown>> & {
    readonly kind: Kind;
    readonly constraints: Record<string, unknown>;
  };
  <Kind extends string, Input, Output, Tag extends string, Context extends SolverContext>(
    kind: Kind,
    input: Input,
    output: Output,
    constraints: NoInfer<Record<string, unknown>>,
    context: NoInfer<Context>,
    tag: NoInfer<Branded<Tag, 'Tag'>>,
  ): SolverFactory<Kind, Input, Output, Context & Record<string, unknown>>;
  <Kind extends string, Input extends SolverPayload<string>, Output>(
    kind: Kind,
    input: Input,
    output: Output,
    constraints: NoInfer<{ readonly kind: Input['kind']; readonly value: string }>,
  ): SolverFactory<Kind, Input, Output, { readonly kind: Input['kind'] }>;
  <Kind extends string, Input, Output, Extra extends Record<string, unknown>, Config extends { readonly retries: number }>(
    kind: Kind,
    input: Input,
    output: Output,
    constraints: NoInfer<NoInferExtra<Extra>>,
    extra: NoInfer<Extra>,
    config: NoInfer<Config>,
  ): SolverFactory<Kind, Input, Output, Extra & Config>;
  <Kind extends string, Input, Output, Constraints extends ConstraintGraph<string[]>, Context extends SolverContext>(
    kind: Kind,
    input: Input,
    output: Output,
    constraints: NoInfer<Constraints>,
    context: NoInfer<Context>,
    markers: NoInfer<readonly ConstraintFactory<string, string, Record<string, unknown>, string>[]>,
    ...rest: readonly [Context, ...readonly ConstraintFactory<string, string, Record<string, unknown>, string>[]]
  ): SolverFactory<Kind, Input, Output, Constraints & Context>;
  }

export type NoInferExtra<T> = [T][T extends unknown ? 0 : never];

export const makeSolverFactory: SolverOverload = (...args: readonly unknown[]) => {
  const [kind, input, output, constraints] = args;
  const context = args[3];
  return {
    kind,
    input,
    output,
    constraints,
    createdAt: Date.now(),
  } as never;
};

export type InvocationTuple<TKind extends string, TInput, TOutput> = [TKind, TInput, TOutput];
export type SolverPlan<T extends readonly InvocationTuple<string, unknown, unknown>[]> = {
  readonly nodes: T;
  readonly size: T['length'];
};

export type RecursiveConstraint<A extends SolverSignature, Depth extends number> =
  Depth extends 0
    ? A
    : {
        readonly depth: Depth;
        readonly signature: RecursiveConstraint<A, DecrementDepth<Depth>>;
      };

export type DecrementDepth<N extends number> = N extends 0 ? 0 : number;

export type BrandedConstraint = Branded<'recover', 'SolverKind'>;

export type SolverEnvelope<T extends SolverSignature> = {
  readonly signature: T;
  readonly resolved: ResolveConstraint<T>;
  readonly marker: T['fallback'];
};

export const solverSignatures = [
  {
    a: 'discover:incident',
    b: 'discover:incident',
    c: { attempt: 1 },
    flow: true,
    fallback: 'fast',
  },
  {
    a: 'assess:workload',
    b: 'assess:workload',
    c: { workload: 90 },
    flow: true,
    fallback: 'safe',
  },
  {
    a: 'simulate:forecast',
    b: 'simulate:forecast',
    c: { windows: 12 },
    flow: true,
    fallback: 'deep',
  },
  {
    a: 'rollback:service',
    b: 'rollback:service',
    c: { risk: 0.77 },
    flow: true,
    fallback: 'hard',
  },
  {
    a: 'archive:log',
    b: 'archive:log',
    c: { ttl: 1440 },
    flow: true,
    fallback: 'dry',
  },
 ] as readonly SolverSignature[];

export const signatureMap = Object.fromEntries(
  solverSignatures.map((entry) => [entry.a, entry.fallback]),
) as Record<string, string>;

export const makeSolverSet = <
  TKind extends string,
  TInput extends SolverPayload<TKind>,
  TOutput,
  TConstraints extends Record<string, unknown>,
>(
  payload: TInput,
  output: TOutput,
  constraints: TConstraints,
  context?: SolverContext,
): SolverFactory<TKind, TInput, TOutput, TConstraints & Record<string, unknown>> => {
  if (!context) {
    return makeSolverFactory(
      payload.kind as TKind,
      payload,
      output,
      constraints as TConstraints,
    ) as SolverFactory<TKind, TInput, TOutput, TConstraints & Record<string, unknown>>;
  }

  return makeSolverFactory(
    payload.kind as TKind,
    payload,
    output,
    constraints as TConstraints,
    context,
    `${context.tenant}-tag` as Branded<string, 'Tag'>,
  ) as SolverFactory<TKind, TInput, TOutput, TConstraints & Record<string, unknown>>;
};

export const plan: SolverPlan<[
  InvocationTuple<'discover', SolverPayload<'discover'>, SolverResult<'discover', { readonly status: 'ok' }>>,
  InvocationTuple<'assess', SolverPayload<'assess'>, SolverResult<'assess', { readonly score: number }>>,
  InvocationTuple<'simulate', SolverPayload<'simulate'>, SolverResult<'simulate', readonly string[]>>,
  InvocationTuple<'rollback', SolverPayload<'rollback'>, SolverResult<'rollback', { readonly rollback: true }>>,
  InvocationTuple<'archive', SolverPayload<'archive'>, SolverResult<'archive', { readonly archived: true }>>,
]> = {
  nodes: [
    ['discover', { kind: 'discover', domain: 'incident', value: 'event' as Branded<string, 'SolverValue'> }, { kind: 'discover', output: { status: 'ok' }, ok: true, correlation: 'discover-corr' as Branded<string, 'Correlation'> }],
    ['assess', { kind: 'assess', domain: 'risk', value: 'metric' as Branded<string, 'SolverValue'> }, { kind: 'assess', output: { score: 91 }, ok: true, correlation: 'assess-corr' as Branded<string, 'Correlation'> }],
    ['simulate', { kind: 'simulate', domain: 'forecast', value: 'seed' as Branded<string, 'SolverValue'> }, { kind: 'simulate', output: ['simulated'], ok: true, correlation: 'simulate-corr' as Branded<string, 'Correlation'> }],
    ['rollback', { kind: 'rollback', domain: 'service', value: 'rollback-script' as Branded<string, 'SolverValue'> }, { kind: 'rollback', output: { rollback: true }, ok: true, correlation: 'rollback-corr' as Branded<string, 'Correlation'> }],
    ['archive', { kind: 'archive', domain: 'history', value: 'snapshot' as Branded<string, 'SolverValue'> }, { kind: 'archive', output: { archived: true }, ok: true, correlation: 'archive-corr' as Branded<string, 'Correlation'> }],
  ],
  size: 5,
};

export const planEntries = plan.nodes.map((entry) => entry[0]).join('|')
  .split('|')
  .map((token, index) => `${index}:${token}`);

export const recursiveConstraint = <N extends number>(depth: N): RecursiveConstraint<SolverSignature, N> => {
  const root: SolverSignature = solverSignatures[0]!;
  const normalizedDepth = Number(depth);
  if (normalizedDepth <= 0) {
    return root as RecursiveConstraint<SolverSignature, N>;
  }
  return {
    depth: depth,
    signature: {
      depth: (normalizedDepth - 1) as unknown as N,
      signature: root,
    } as unknown as RecursiveConstraint<SolverSignature, N>,
  } as unknown as RecursiveConstraint<SolverSignature, N>;
};

export const satisfiesExample = {
  kind: 'discover:incident',
  domain: 'incident',
  value: 'event' as Branded<string, 'SolverValue'>,
  payloadType: 'event',
  expectedChecks: ['input-closed', 'output-open', 'checksum-valid'],
} satisfies SolverPayload<`discover:${string}`> & { readonly payloadType: string; readonly expectedChecks: string[] };

export const solverByKind = (invocations: typeof plan.nodes) => {
  const initial = {} as Record<string, SolverFactory<string, unknown, unknown, Record<string, unknown>>>;
  return invocations.reduce((acc, [kind, input, output]) => {
    acc[kind] = makeSolverFactory(kind, input, output, { kind });
    return acc;
  }, initial);
};

export const solverDispatch = solverByKind(plan.nodes);

export type SolverByNameMap = ReturnType<typeof solverByKind>;
export type SolverValueFor<K extends keyof SolverByNameMap> = K extends keyof SolverByNameMap
  ? SolverByNameMap[K]
  : never;
