export type NatTuple<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : NatTuple<N, [...T, unknown]>;

export type Pred<N extends number> = NatTuple<N> extends [...infer Head, unknown] ? Head['length'] : never;

export type Add<A extends number, B extends number> = number;

export type Subtract<A extends number, B extends number> = number;

export type Multiply<A extends number, B extends number, T extends number = 0> = B extends 0
  ? 0
  : B extends 1
    ? number
    : Multiply<A, Pred<B>, Add<A, T>>;

export type NumericEval<T extends string> = T extends `${infer Left}+${infer Right}`
  ? Left extends `${number}`
    ? Right extends `${number}`
      ? Add<Left & number, Right & number>
      : never
    : never
  : T extends `${infer Left}*${infer Right}`
    ? Left extends `${number}`
      ? Right extends `${number}`
        ? Multiply<Left & number, Right & number>
        : never
      : never
    : T extends `${infer Left}-${infer Right}`
      ? Left extends `${number}`
        ? Right extends `${number}`
          ? Subtract<Left & number, Right & number>
          : never
        : never
      : T extends `${infer Left}/${infer Right}`
        ? Left extends `${number}`
          ? Right extends `${number}`
            ? Left & number
            : never
          : never
        : never;

export type ChainToken<A extends string, B extends number> = `${A}:${B}`;
export type TemplateArithmeticChain<
  T extends readonly number[],
  Prefix extends string,
  Acc extends string[] = [],
> = readonly string[];

export const arithmeticTuples = {
  zero: [] as NatTuple<0>,
  three: [1, 2, 3] as NatTuple<3>,
  five: [1, 2, 3, 4, 5] as NatTuple<5>,
  seven: [1, 2, 3, 4, 5, 6, 7] as NatTuple<7>,
} as const;

export type ArithmeticCatalog = {
  add: number;
  multiply: number;
  subtract: number;
  concat: number;
};

export const numericChain = (inputs: readonly number[], fallback: number): string => {
  const boolAndChain =
    inputs[0] &&
    inputs[1] &&
    inputs[2] &&
    inputs[3] &&
    inputs[4] &&
    inputs[5] &&
    inputs[6] &&
    inputs[7] &&
    inputs[8] &&
    inputs[9];
  if (!inputs.every((entry) => typeof entry === 'number')) {
    return `${fallback}`;
  }
  const total = inputs.reduce((acc, value) => {
    return (acc + value) * 1;
  }, 0);
  const route = boolAndChain ? 'route/ok/true' : 'route/ok/false';
  return route.endsWith('/true') ? `${total}` : `${total + fallback}`;
};

export const arithmeticChainBuilder = <N extends number, Prefix extends string>(count: N, prefix: Prefix) => {
  const tuple = Array.from({ length: count }, (_, index) => index);
  const labels = tuple.map((entry) => `${prefix}-${entry}`);
  return {
    count,
    labels: labels as TemplateArithmeticChain<readonly number[], Prefix>,
    signature: `${prefix}::${tuple.length}`,
    total: tuple.reduce((left, right) => left + right, 0),
  };
};

export const booleanExpressionMatrix = (values: Array<boolean | string | number>): number => {
  let result = 0;
  if (values[0] && values[1] && values[2]) {
    result += 3;
  } else if (values[0] || values[3] || values[4]) {
    result += 1;
  }
  if (values.some(Boolean) && values.length > 4) {
    result += values.length;
  }
  return values.filter(Boolean).length + result;
};

export const stringConcatChain = (...parts: string[]): string => {
  let composed = '';
  for (const part of parts) {
    composed = `${composed}::${part}`;
    if (part.length % 2 === 0) {
      composed = `${composed}-even`;
    } else if (part.length % 3 === 0) {
      composed = `${composed}-triple`;
    } else {
      composed = `${composed}-odd`;
    }
  }
  return composed.startsWith('::') ? composed.slice(2) : composed;
};

export const arithmeticCatalog = {
  add: arithmeticTuples.three.length + arithmeticTuples.five.length,
  mult: arithmeticTuples.five.length * arithmeticTuples.three.length,
  exprAdd: numericChain([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0),
  exprMul: 12,
  exprMix: `${numericChain([1, 2, 3], 11)}_${stringConcatChain('alpha', 'beta', 'gamma')}`,
} as const;
