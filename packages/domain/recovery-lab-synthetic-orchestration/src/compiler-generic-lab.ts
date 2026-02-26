import type { Brand, NoInfer } from '@shared/type-level';

export type WorkbenchId = Brand<string, 'WorkbenchId'>;

export type ResolverOutput<T, U = unknown> = {
  readonly value: T;
  readonly meta: U;
  readonly ok: true;
};

export type ResolverFailure = {
  readonly ok: false;
  readonly error: Error;
};

export type ResolverResult<T, U = unknown> = ResolverOutput<T, U> | ResolverFailure;

export function resolvePayload<T>(payload: T): ResolverOutput<T>;
export function resolvePayload<T, U extends string>(payload: T, tag: U): ResolverOutput<T, { tag: U }>;
export function resolvePayload<T, U, V>(
  payload: T,
  tag: V,
  context: U,
): ResolverOutput<T, { tag: V; context: U }>;
export function resolvePayload<T, U, V, W>(
  payload: T,
  tag: V,
  context: U,
  extras: readonly W[],
): ResolverOutput<T, { tag: V; context: U; extras: W[] }>;
export function resolvePayload<T, U, V>(
  payload: T,
  tag?: string | V,
  context?: U,
  extras?: readonly unknown[],
): ResolverOutput<T, unknown> {
  if (tag === undefined) {
    return { value: payload, meta: undefined as never, ok: true };
  }
  if (context === undefined) {
    return { value: payload, meta: { tag }, ok: true } as ResolverOutput<T, { tag: U }>;
  }
  if (extras === undefined) {
    return {
      value: payload,
      meta: {
        tag,
        context,
      },
      ok: true,
    } as ResolverOutput<T, { tag: V; context: U }>;
  }
  return {
    value: payload,
    meta: {
      tag,
      context,
      extras: [...extras],
    },
    ok: true,
  } as ResolverOutput<T, { tag: V; context: U; extras: unknown[] }>;
}

export const liftResolver = <TInput>() =>
  <TOutput, TTag extends string>(_input: TInput, output: TOutput, tag: TTag): ResolverOutput<TOutput, { tag: TTag }> => ({
    value: output,
    meta: { tag },
    ok: true,
  });

export const applyResolver = <T, V, K extends string>(
  resolver: (payload: T, tag: K) => ResolverOutput<V, { tag: K }>,
  values: readonly T[],
): Array<ResolverOutput<V, { tag: K }>> => {
  return values.map((value) => {
    const wrapped = resolver(value, 'runtime' as K);
    return wrapped;
  });
};

type TupleFactory<T extends number, R extends unknown[] = []> = R['length'] extends T
  ? R
  : TupleFactory<T, [...R, WorkbenchId]>;

type ConstrainedMap<
  A extends string,
  B extends NoInfer<A>,
  C extends Record<A, B>,
  D extends keyof C = keyof C,
> = {
  readonly source: A;
  readonly keys: D;
  readonly value: C[D];
};

export const buildConstraintMatrix = <A extends string, B extends A, C extends Record<A, B>>(
  values: readonly A[],
): ConstrainedMap<A, B, C>[] => {
  return values.map((value) => ({
    source: value as B,
    keys: (Object.keys({ [value]: value })[0] as A) as keyof C,
    value: (value as unknown) as C[keyof C],
  }));
};

export const createFactory = <A, B extends readonly unknown[], C extends NoInfer<A>>() => {
  const seed: A = null as unknown as A;
  return (values: [...B], marker: C): {
    readonly seed: A;
    readonly values: [...B];
    readonly marker: C;
  } => ({
    seed,
    values,
    marker,
  });
};

const lifted = liftResolver<string>();
const liftedWithContext = <T>(value: T): ResolverResult<T, { tag: 'from-context'; context: { scope: string } }> =>
  ({ value, meta: { tag: 'from-context', context: { scope: 'scope-a' } }, ok: true });

const overloaded = resolvePayload(1, 'tag', { region: 'us-east-1' }, [1, 2, 3]);

export const overloadMatrix = [
  resolvePayload('static'),
  resolvePayload('tagged', 'seed'),
  resolvePayload({ nested: true }, 'seeded', { tenant: 'tenant-1' }),
  resolvePayload({ nested: { active: true } }, 'seeded', { tenant: 'tenant-2' }, ['a', 'b']),
  lifted('seed-only', 'seed-only', 'seed-only'),
  liftedWithContext({ tenant: 'tenant-ctx' }),
] as const;

export const overloadSeed = [overloaded, lifted('seed-only', 17, 'seed-only')] as const;

export const matrixByDepth = (
  base: number,
  depth: number,
): Array<ResolverOutput<ReadonlyArray<number>>> => {
  const output: Array<ResolverOutput<ReadonlyArray<number>>> = [];
  for (let level = 0; level < depth; level += 1) {
    const levelPayload: ReadonlyArray<number> = Array.from({ length: level }, () => base);
    output.push(resolvePayload(levelPayload, 'depth'));
  }
  return output;
};
