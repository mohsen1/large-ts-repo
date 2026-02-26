export type Zero = [];
export type Succ<T extends unknown[]> = [...T, unknown];

export type Add<A extends number, B extends number, Acc extends unknown[] = []> = Acc['length'] extends A
  ? B
  : Add<A, B, Succ<Acc>> extends infer Sum extends number
    ? Sum
    : never;

export type Sub<A extends number, B extends number, Acc extends unknown[] = []> =
  A extends B
    ? 0
    : B extends 0
      ? A
      : A extends 0
        ? never
        : B extends 0
          ? never
          : Sub<A, B, Succ<Acc>>;

export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> =
  A extends 0
    ? 0
    : B extends 0
      ? 0
      : B extends 1
        ? A
        : Add<A, Multiply<A, Decrement<B>>>;

export type Decrement<N extends number> =
  [...BuildTuple<N>] extends [unknown, ...infer Rest] ? Rest['length'] : never;

export type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N
  ? T
  : BuildTuple<N, [...T, unknown]>;

export type Mod<A extends number, B extends number> = A extends B
  ? 0
  : A extends 0
    ? 0
    : A extends infer R
      ? R extends number
        ? R extends B
          ? 0
          : R extends `${infer _}x`
            ? never
            : never
        : never
      : never;

export type ConcatLiteral<A extends string, B extends string> = `${A}-${B}`;

export type ConcatNumeric<A extends number, B extends number> = `${A}${B}`;

export type BoolTuple<T extends boolean, L extends number = 5> =
  L extends 0
    ? []
    : [T, ...BoolTuple<T, Decrement<L>>];

export type EvaluateBinaryExpression<T extends string> =
  T extends `${infer Left}+${infer Right}`
    ? Left extends `${infer L extends number}`
      ? Right extends `${infer R extends number}`
        ? Add<L, R>
        : never
      : never
    : T extends `${infer Left}-${infer Right}`
      ? Left extends `${infer L extends number}`
        ? Right extends `${infer R extends number}`
          ? Sub<L, R>
          : never
        : never
      : T extends `${infer Left}*${infer Right}`
        ? Left extends `${infer L extends number}`
          ? Right extends `${infer R extends number}`
            ? Multiply<L, R>
            : never
          : never
        : never;

export type ParseEventChain<T extends string> =
  T extends `${infer Head}-${infer Tail}`
    ? { head: Head; tail: Tail }
    : { head: T; tail: never };

export type ParseBooleanChain<T extends string> =
  T extends `${infer Left}&&${infer Rest}`
    ? { left: Left; rest: ParseBooleanChain<Rest> }
    : T extends `${infer Left}||${infer Rest}`
      ? { left: Left; rest: ParseBooleanChain<Rest> }
      : { left: T; rest: never };

export type BoolEval<T extends string, Acc extends boolean = true> =
  T extends `${infer L}&&${infer R}`
    ? BoolEval<R, Acc extends true ? (L extends 'true' ? true : false) : false>
    : T extends `${infer L}||${infer R}`
      ? BoolEval<R, Acc extends true ? true : (L extends 'true' ? true : false)>
      : Acc extends true ? (T extends 'true' ? true : false) : false;

export type LongAndChain<N extends number> = BoolTuple<true, N>;

export type StringChain<T extends number> =
  `/${T}/${T}/${T}` extends infer V extends string ? ParseEventChain<V> : never;

export const binarySeeds = [
  '1+2',
  '9-3',
  '5*6',
  '1+2+3+4',
  '8-4-1',
  '3*3*2',
  'false&&true||false',
  'true&&true&&false',
  'true||false||true',
] as const;

export const stringExpressions = [
  'node-alpha',
  'node-beta',
  'node-gamma',
  'node-delta',
] as const;

export const evaluateExpression = (text: string): string | number | boolean => {
  if (text.includes('+') || text.includes('-') || text.includes('*')) {
    const expr = text.split(' ').join('');
    if (expr.includes('*')) {
      const [left, right] = expr.split('*');
      return Number(left) * Number(right);
    }
    if (expr.includes('+')) {
      const [left, right] = expr.split('+');
      return Number(left) + Number(right);
    }
    const [left, right] = expr.split('-');
    return Number(left) - Number(right);
  }

  if (exprIncludesAndOr(text)) {
    const andParts = text.split('&&');
    const orParts = text.split('||');
    if (andParts.length > 1) {
      return andParts.every(Boolean);
    }
    return orParts.some(Boolean);
  }

  return text;
};

export function exprIncludesAndOr(value: string): value is `${string}&&${string}` | `${string}||${string}` {
  return value.includes('&&') || value.includes('||');
}

export const evaluateExpressions = (expressions: readonly string[]) =>
  expressions.reduce(
    (acc, expression) => ({
      ...acc,
      [expression]: evaluateExpression(expression),
    }),
    {} as Record<string, string | number | boolean>,
  );

export const booleanGrid = [
  ...new Array(16).fill(false),
  ...new Array(16).fill(true),
].map((value, index) => ({
  index,
  value,
  chain: index % 2 === 0,
  key: `${index}${index}`,
})) satisfies readonly {
  index: number;
  value: boolean;
  chain: boolean;
  key: string;
}[];

export const literalTrace = stringExpressions.reduce<Record<string, string>>((acc, route, index) => {
  const key = `${route}-trace-${index}`;
  return {
    ...acc,
    [key]: `${route}/${index}/${key}`,
  };
}, {});

export type BinaryEvalSeed = typeof binarySeeds[number];
export type BinaryEvalResult = ReturnType<typeof evaluateExpressions>;
export type BooleanGrid = typeof booleanGrid;

export const runBinaryMatrix = () => {
  const evals = evaluateExpressions([...binarySeeds]);
  const resolved: string[] = [];
  const pending = Object.entries(evals);

  for (let i = 0; i < pending.length; i += 1) {
    const [expr, result] = pending[i];
    if (typeof result === 'number' && result > 10) {
      resolved.push(`${expr}:high:${result}`);
      continue;
    }

    if (typeof result === 'boolean') {
      resolved.push(`${expr}:bool:${result}`);
      continue;
    }

    resolved.push(`${expr}:raw:${result}`);
  }

  return {
    evals,
    resolved,
  };
};

export const binarySpectrum = runBinaryMatrix();
