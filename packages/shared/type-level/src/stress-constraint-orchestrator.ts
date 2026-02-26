export type ConstraintTuple<K extends string = string, V = unknown> = readonly [
  { readonly key: K; readonly value: V },
  { readonly key: `next-${K}`; readonly value: V },
]

export type ConstraintNode<K extends string = string, V = unknown> = {
  readonly key: K;
  readonly value: V;
};

export type ConstraintMap<N extends ReadonlyArray<ConstraintNode>> = N extends readonly [infer H, ...infer Tail]
  ? H extends ConstraintNode<infer K, infer V>
    ? ConstraintMap<Tail & ReadonlyArray<ConstraintNode>> & { readonly [P in K]: V }
    : ConstraintMap<Tail & ReadonlyArray<ConstraintNode>>
  : {};

export type ConflictState = 'open' | 'resolved' | 'blocked';

export type ConstraintFlow<A extends ConstraintNode, B extends ConstraintNode> =
  A['key'] extends `sig:${B['key']}`
    ? { readonly match: true; readonly key: A['key'] }
    : { readonly match: false; readonly key: A['key'] };

export type ConstraintPayload<T extends ConstraintNode> = T['value'] extends string
  ? { readonly payload: `resolved:${T['value']}`; readonly state: ConflictState }
  : { readonly payload: `encoded:${string}`; readonly state: ConflictState };

export type ConstraintEnvelope<
  A extends ConstraintNode,
  B extends ConstraintNode<`sig:${A['key']}`, A['value']>,
> = {
  readonly left: A;
  readonly right: B;
  readonly compatibility: ConstraintFlow<A, B>;
  readonly payload: ConstraintPayload<A>;
};

export type ConstraintStack<T extends ConstraintNode, Depth extends number> = Depth extends 0
  ? [T]
  : readonly [T, ...ConstraintStack<ConstraintNode<`r${Depth}-${T['key']}`, T['value']>, Decrement<Depth>>];

export type Decrement<N extends number> = N extends 0
  ? 0
  : N extends 1
    ? 0
    : N extends 2
      ? 1
      : N extends 3
        ? 2
        : N extends 4
          ? 3
          : N extends 5
            ? 4
            : N extends 6
              ? 5
              : N extends 7
                ? 6
                : N extends 8
                  ? 7
                  : N extends 9
                    ? 8
                    : N extends 10
                      ? 9
                      : 10;

export type RecursiveConstraint<T, N extends number> = N extends 0
  ? T
  : RecursiveConstraint<{
      readonly left: T;
      readonly depth: N;
      readonly nested: Array<T>;
    }, Decrement<N>>;

export type ConstraintGraph<T extends ReadonlyArray<ConstraintNode>> = {
  readonly nodes: T;
  readonly map: ConstraintMap<T>;
  readonly checksum: T['length'];
};

export function buildConstraintMap<T extends readonly ConstraintNode[]>(nodes: T): ConstraintMap<T> {
  const out: Record<string, unknown> = {};
  for (const node of nodes) {
    out[node.key] = node.value;
  }
  return out as ConstraintMap<T>;
}

export function resolveConstraint<A extends ConstraintNode, B extends ConstraintNode<`sig:${A['key']}`, A['value']>>(input: {
  left: A;
  right: B;
}): ConstraintEnvelope<A, B> {
  return {
    left: input.left,
    right: input.right,
    compatibility: {
      match: true,
      key: input.left.key,
    } as ConstraintFlow<A, B>,
    payload: {
      payload: `resolved:${String(input.left.value)}` as ConstraintPayload<A>['payload'],
      state: 'resolved',
    } as ConstraintPayload<A>,
  } as ConstraintEnvelope<A, B>;
}

export function normalizeConstraintGraph<T extends readonly ConstraintNode[]>(nodes: T): ConstraintGraph<T> {
  return {
    nodes,
    map: buildConstraintMap(nodes),
    checksum: nodes.length,
  };
}

export const defaultConstraintNodes = [
  { key: 'node-1', value: 'ready' },
  { key: 'node-2', value: 'draining' },
  { key: 'node-3', value: 'cooldown' },
] as const satisfies readonly ConstraintNode[];

export type DefaultConstraintGraph = ConstraintGraph<typeof defaultConstraintNodes>;
export const defaultConstraintGraph: DefaultConstraintGraph = normalizeConstraintGraph(defaultConstraintNodes);

export function makeEnvelopeTuple<T extends readonly ConstraintNode[]>(nodes: T): readonly [...ConstraintStack<T[number], 3>] {
  const [head] = nodes;
  if (!head) {
    return [] as unknown as readonly [...ConstraintStack<T[number], 3>];
  }

  const first: ConstraintNode = { key: `sig:${head.key}`, value: head.value };
  return [head, first] as unknown as readonly [...ConstraintStack<T[number], 3>];
}

export function nestedConstraintPayload<T extends ConstraintNode>(input: T): RecursiveConstraint<T, 4> {
  const node = {
    left: input,
    depth: 4,
    nested: [input],
  } as unknown as RecursiveConstraint<T, 4>;
  return node;
}

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export function buildNode<T extends string>(key: NoInfer<T>, value: `n-${T}`): ConstraintNode<T, `n-${T}`> {
  return { key, value };
}

export function overloadedConstraint<T extends string>(value: T): T;
export function overloadedConstraint<T extends string>(value: T, suffix: T): T;
export function overloadedConstraint(value: string, suffix?: string): string {
  return suffix ? `${value}:${suffix}` : value;
}

export type ConstraintSolverMatrix<T extends ReadonlyArray<ConstraintNode>> = {
  readonly [K in keyof T]: ConstraintPayload<T[K] & ConstraintNode>;
};

export const constraintSolverMatrix = <T extends readonly ConstraintNode[]>(
  values: T,
): ConstraintSolverMatrix<T> =>
  values.map((entry) => ({
    payload: `encoded:${String(entry.value)}`,
    state: 'open',
  } as ConstraintPayload<ConstraintNode>)) as ConstraintSolverMatrix<T>;

export const constraintBench = {
  first: buildNode('signal', 'n-signal'),
  second: buildNode('signal', 'n-signal'),
  stack: makeEnvelopeTuple(defaultConstraintNodes),
} as const;
