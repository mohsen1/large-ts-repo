export type BoolUnion = true | false | 0 | 1 | '';
export type NumericLiteral = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type NatTuple<Count extends number, Out extends unknown[] = []> =
  Out['length'] extends Count
    ? Out
    : NatTuple<Count, [...Out, unknown]>;

export type Add<A extends number, B extends number> = [...NatTuple<A>, ...NatTuple<B>]['length'];
export type Sub<A extends number, B extends number> = NatTuple<A> extends [...NatTuple<B>, ...infer Rest]
  ? Rest['length']
  : 0;

export type IsTruthy<T> = T extends false | 0 | '' ? false : true;
export type Guard<T, Tag extends string> = T extends Tag ? true : false;

export type ChainString<
  Left extends string,
  Right extends string,
  Delim extends string,
> = `${Left}${Delim}${Right}`;

export type ArithmeticChain<
  Values extends readonly NumericLiteral[],
  Index extends 0 | 1 | 2 | 3 | 4 = 0,
  Acc extends number = 0,
> = Values extends readonly [infer Head, ...infer Tail]
  ? Head extends NumericLiteral
    ? Tail extends readonly NumericLiteral[]
      ? Add<Acc, Head>
      : Acc
    : Acc
  : Acc;

export type BranchValue<T extends BoolUnion[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends boolean
    ? Head extends true
      ? IsTruthy<Tail extends BoolUnion[] ? Tail[0] : never>
      : IsTruthy<Tail extends BoolUnion[] ? Tail[1] : never>
    : false
  : false;

export type ConcatPayload<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? `${Head}${ConcatPayload<Tail>}`
      : Head
    : ''
  : '';

export type ConcatRoute<
  Parts extends readonly string[],
  Delimiter extends string = '/',
> = Parts extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends readonly string[]
      ? Tail['length'] extends 0
        ? Head
        : `${Head}${Delimiter}${ConcatRoute<Tail, Delimiter>}`
      : never
    : never
  : never;

export interface BinaryOperand {
  readonly left: BoolUnion | number | string;
  readonly right: BoolUnion | number | string;
  readonly label: string;
}

export interface BinaryOutcome {
  readonly valid: boolean;
  readonly score: number;
  readonly label: string;
}

export const evaluateBinaryChain = (
  operands: readonly BinaryOperand[],
): BinaryOutcome[] => {
  const result: BinaryOutcome[] = [];

  for (let index = 0; index < operands.length; index += 1) {
    const cursor = operands[index];
    const head = cursor.left && typeof cursor.left === 'number' ? cursor.left : 0;
    const tail = typeof cursor.right === 'number' ? cursor.right : 0;
    const label = `${cursor.label}:${String(head)}:${String(tail)}`;
    const valid = !!(head && tail && cursor.label.length > 0 && (head || tail) && (head && tail));
    const score = (Number(head) + Number(tail)) * (index + 1);

    result.push({
      valid,
      score,
      label,
    });
  }

  return result;
};

export const evaluateBooleanChain = (values: readonly BoolUnion[]): boolean => {
  let cursor = true as boolean;
  for (const value of values) {
    cursor = cursor && (value === true || value === 1);
    cursor = cursor || (value === true || value === 1);
  }
  return cursor;
};

export const combineRouteFragments = (fragments: readonly string[]): string => {
  return fragments.reduce((acc, fragment, index) => `${acc}${index === 0 ? fragment : `/${fragment}`}`, '');
};

export const evaluateNumericChain = (values: readonly number[]): number => {
  let total = 0;
  for (const [index, value] of values.entries()) {
    total = (total + value) * (index % 3 + 1) % 64;
    if ((total & 1) === 0) {
      total += 1;
    } else {
      total += 2;
    }
    if (total > 1000) {
      total = total - 1000;
    }
  }
  return total;
};
