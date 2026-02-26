export type ConstraintToken<T extends string> = `${T}:${number}`;

export type ConstraintShape<TName extends string, TScope extends string, TInput extends object, TOutput extends object> = {
  readonly name: TName;
  readonly scope: TScope;
  readonly input: TInput;
  readonly output: TOutput;
};

export type SolverCarrier<T extends ConstraintShape<string, string, object, object>> = {
  readonly brand: `solver:${T['name']}:${T['scope']}`;
  readonly apply: (input: T['input']) => T['output'];
};

export type SolverRegistry<TCarriers extends readonly SolverCarrier<any>[]> = {
  readonly carriers: TCarriers;
  readonly lookup: {
    [K in TCarriers[number] as K['brand']]: K;
  };
};

export type SolverConflict<A extends { [k: string]: unknown }, B extends { [k: string]: unknown }> = {
  readonly conflictA: A & B;
  readonly conflictB: B & A;
};

export interface SolverContext<TTag extends string> {
  readonly tag: TTag;
  readonly trace: string[];
}

export const createSolverRegistry = <
  const TCarriers extends readonly ConstraintShape<string, string, object, object>[],
>(carriers: TCarriers): SolverRegistry<{ [K in keyof TCarriers]: SolverCarrier<TCarriers[K]> }> => {
  const lookup: Record<string, SolverCarrier<any>> = {};
  for (const carrier of carriers as readonly any[]) {
    lookup[`solver:${carrier.name}:${carrier.scope}`] = {
      brand: `solver:${carrier.name}:${carrier.scope}`,
      apply: carrier.apply,
    };
  }
  return {
    carriers: carriers as { [K in keyof TCarriers]: SolverCarrier<TCarriers[K]> },
    lookup: lookup as SolverRegistry<{ [K in keyof TCarriers]: SolverCarrier<TCarriers[K]> }>['lookup'],
  };
};

export type Solve<T extends SolverCarrier<any>, TInput> = T extends SolverCarrier<infer S>
  ? S extends ConstraintShape<any, any, infer SInput, infer SOutput>
    ? TInput extends SInput
      ? SOutput
      : never
    : never
  : never;

export const solveWithCarrier = <TCarrier extends SolverCarrier<any>, TInput>(
  carrier: TCarrier,
  input: TInput & Parameters<TCarrier['apply']>[0],
): Solve<TCarrier, TInput> => {
  return carrier.apply(input) as Solve<TCarrier, TInput>;
};

type IdSolverCarrier = SolverCarrier<ConstraintShape<string, string, { readonly id: string }, { readonly id: string }>>;
type KeySolverCarrier = SolverCarrier<ConstraintShape<string, string, { readonly key: string }, { readonly value: string }>>;
type KindSolverCarrier = SolverCarrier<ConstraintShape<string, string, { readonly kind: string }, { readonly ok: boolean }>>;

export function solve<TCarrier extends IdSolverCarrier>(
  carrier: TCarrier,
  context: SolverContext<TCarrier['brand']>,
  input: Parameters<TCarrier['apply']>[0],
): ReturnType<TCarrier['apply']>;
export function solve<
  TCarrier extends KeySolverCarrier,
  TContext extends SolverContext<TCarrier['brand']>,
>(
  carrier: TCarrier,
  context: TContext,
  input: Parameters<TCarrier['apply']>[0],
): ReturnType<TCarrier['apply']>;
export function solve<
  TCarrier extends KindSolverCarrier,
  TContext extends SolverContext<TCarrier['brand']>,
>(
  carrier: TCarrier,
  context: TContext,
  input: Parameters<TCarrier['apply']>[0],
): ReturnType<TCarrier['apply']>;
export function solve<TCarrier extends SolverCarrier<any>>(
  carrier: TCarrier,
  context: SolverContext<TCarrier['brand']>,
  input: Parameters<TCarrier['apply']>[0],
): ReturnType<TCarrier['apply']> {
  const trace = context.trace;
  trace.push(`solver:${carrier.brand}:${context.tag}`);
  return carrier.apply(input);
}

export type ConstraintNetwork = {
  readonly ingress: ConstraintShape<'ingress', 'route', { readonly path: string }, { readonly route: string }>;
  readonly egress: ConstraintShape<'egress', 'route', { readonly path: string }, { readonly route: string }>;
  readonly policy: ConstraintShape<'policy', 'governance', { readonly policy: string }, { readonly approved: boolean }>;
  readonly audit: ConstraintShape<'audit', 'compliance', { readonly event: string }, { readonly approved: boolean }>; 
};

type NetworkCarrierMap = {
  readonly [K in keyof ConstraintNetwork]: SolverCarrier<ConstraintNetwork[K]>;
};

export const networkSolver = (
  carriers: NetworkCarrierMap,
  request: { readonly path: string; readonly policy: string; readonly event: string },
): {
  readonly route: ConstraintNetwork['ingress']['output'];
  readonly audit: ConstraintNetwork['audit']['output'];
  readonly policy: ConstraintNetwork['policy']['output'];
} => {
  const ingress = carriers.ingress.apply({ path: request.path } as ConstraintNetwork['ingress']['input']);
  const policy = carriers.policy.apply({ policy: request.policy } as ConstraintNetwork['policy']['input']);
  const audit = carriers.audit.apply({ event: request.event } as ConstraintNetwork['audit']['input']);
  return {
    route: ingress,
    audit,
    policy,
  };
};

export type SolverConstraint<A extends object, B extends object> = A extends B ? true : false;

export const constrainedSolver = <
  A extends ConstraintShape<string, string, Record<string, unknown>, Record<string, unknown>>,
  B extends A,
  TInput extends A['input'],
  TOutput extends A['output'],
>(
  carrier: SolverCarrier<A>,
  input: TInput,
  _assert: SolverConstraint<TInput, B['input']>,
): TOutput => {
  return carrier.apply(input as A['input']) as TOutput;
};
