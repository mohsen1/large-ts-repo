import type { Brand } from './patterns';

export type SolverTag = Brand<string, 'solver-tag'>;
export type SolverPlan = Brand<string, 'solver-plan'>;
export type SolverScope = Brand<string, 'solver-scope'>;

type ConstraintToken<T extends string> = `${T}:${number}`;

type BaseInput = {
  readonly id: SolverTag;
  readonly scope: SolverScope;
  readonly plan: SolverPlan;
  readonly active: boolean;
};

type ConstraintGraph<K extends string, T extends Record<string, K>> = {
  readonly map: T;
  readonly keys: readonly K[];
};

export type ConstraintEnvelope<T extends string, K extends string> = {
  readonly token: ConstraintToken<T>;
  readonly key: K;
  readonly values: readonly K[];
};

type ConstraintResult<A, B, C> = A extends BaseInput
  ? B extends SolverTag
    ? C extends Record<string, A>
      ? {
          readonly anchor: A;
          readonly binding: B;
          readonly catalog: C;
          readonly ready: true;
        }
      : never
    : never
  : never;

type SolverConstraintChain<T extends readonly SolverTag[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends SolverTag
    ? Tail extends readonly SolverTag[]
      ? ConstraintEnvelope<Head & string, Head & string> & SolverConstraintChain<Tail>
      : never
    : never
  : { chain: 'empty' };

type SolverConstraintMap<T extends readonly SolverTag[]> = {
  [K in T[number]]: {
    readonly token: ConstraintToken<K & string>;
    readonly constraints: readonly K[];
  };
};

export type SolverChainResult<T extends readonly SolverTag[]> = {
  readonly chain: SolverConstraintChain<T>;
  readonly map: SolverConstraintMap<T>;
  readonly depth: T['length'];
};

export interface SolverConstraintEngine<A extends BaseInput, B extends SolverTag, C extends Record<string, A>> {
  readonly anchor: A;
  readonly binding: B;
  readonly catalog: C;
  configure(input: BaseInput): ConstraintResult<A, B, C>;
}

class SolverConstraintStore<A extends BaseInput, B extends SolverTag, C extends Record<string, A>> {
  readonly chain: readonly ConstraintEnvelope<SolverTag & string, string>[];
  constructor(
    readonly engine: SolverConstraintEngine<A, B, C>,
    chain: readonly ConstraintEnvelope<SolverTag & string, string>[],
  ) {
    this.chain = chain;
  }

  append(next: ConstraintEnvelope<SolverTag & string, string>): SolverConstraintStore<A, B, C> {
    return new SolverConstraintStore(this.engine, [...this.chain, next]);
  }
}

export const createConstraintStore = <A extends BaseInput, B extends SolverTag, C extends Record<string, A>>(
  anchor: A,
  binding: B,
  catalog: C,
): SolverConstraintStore<A, B, C> => {
  const engine = {
    anchor,
    binding,
    catalog,
    configure(input: BaseInput) {
      return {
        anchor: input as A,
        binding,
        catalog,
        ready: true,
      } as ConstraintResult<A, B, C>;
    },
  } as SolverConstraintEngine<A, B, C>;

  return new SolverConstraintStore(engine, []);
};

export const solveConstraintChain = <T extends readonly SolverTag[]>(
  chain: SolverConstraintStore<BaseInput, SolverTag, Record<string, BaseInput>>,
  steps: T,
): SolverChainResult<T> => {
  let current = chain;
  for (const token of steps) {
    const tokenTag = token as SolverTag & string;
    const entry = {
      token: `token:${tokenTag}` as ConstraintToken<SolverTag & string>,
      key: tokenTag,
      values: [tokenTag],
    } as ConstraintEnvelope<SolverTag & string, SolverTag & string>;

    current = current.append(entry);
  }

  const map = {} as SolverConstraintMap<T>;
  for (const token of steps) {
    (map as Record<string, SolverConstraintMap<T>[T[number]]>)[token] = {
      token: `token:${token as T[number] & string}` as ConstraintToken<T[number] & string>,
      constraints: [token],
    };
  }

  return {
    chain: current.chain as unknown as SolverConstraintChain<T>,
    map,
    depth: steps.length,
  };
};

type ConstraintProbe<T extends string> = T extends `${infer Prefix}-${infer Rest}`
  ? { readonly prefix: Prefix; readonly rest: Rest }
  : { readonly fallback: T };

type IntersectedConstraints<T extends string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? ConstraintProbe<Head> & (Tail extends string[] ? IntersectedConstraints<Tail> : {})
    : {}
  : {};

const baseInput: BaseInput = {
  id: 'solver-anchor' as SolverTag,
  scope: 'global' as SolverScope,
  plan: 'plan-001' as SolverPlan,
  active: true,
};

export const runConstraintWorkflow = async (): Promise<{
  readonly output: SolverChainResult<readonly SolverTag[]>;
  readonly probe: ConstraintProbe<'audit-run'>;
  readonly intersect: IntersectedConstraints<['audit-run', 'solve:2', 'solve:3']>;
}> => {
  const store = createConstraintStore(baseInput, 'bind-1' as SolverTag, { current: baseInput });
  const steps = ['solve:1', 'solve:2', 'solve:3', 'solve:4'] as const;
  const output = solveConstraintChain(store, steps as unknown as readonly SolverTag[]);

  const stack = new AsyncDisposableStack();
  const tracked = { id: 'stack-node' as Brand<string, 'stack-entry'> } as const;
  stack.use({
    [Symbol.asyncDispose]: async () => {
      void tracked.id;
      return undefined;
    },
  });
  await stack.disposeAsync();

  return {
    output,
    probe: { prefix: 'audit', rest: 'run' },
    intersect: { prefix: 'audit', rest: 'run' } as IntersectedConstraints<['audit-run', 'solve:2', 'solve:3']>,
  };
};

export const runConstraintSuite = () => {
  void runConstraintWorkflow();
  return 'ok';
};
