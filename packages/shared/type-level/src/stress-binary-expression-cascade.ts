export type Natural = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export type TupleOf<T, N extends number, A extends unknown[] = []> =
  A['length'] extends N
    ? A
    : TupleOf<T, N, [...A, T]>;

export type Increment<N extends number> = [...TupleOf<unknown, N>, unknown]['length'];

export type Decrement<N extends number> = N extends 0
  ? 0
  : [...TupleOf<unknown, N>] extends [infer _, ...infer Rest]
    ? Rest['length']
    : never;

export type Add<A extends number, B extends number> = [...TupleOf<unknown, A>, ...TupleOf<unknown, B>]['length'];
export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> =
  B extends 0
    ? Acc['length']
    : Multiply<A, Decrement<B>, [...Acc, ...TupleOf<unknown, A>]>;

export type AndExpression<A extends boolean, B extends boolean> = A extends true ? (B extends true ? true : false) : false;

export type OrExpression<A extends boolean, B extends boolean> = A extends true ? true : B;

export type UnaryOp<T extends string> = T extends `-${infer N}`
  ? N extends `${number}`
    ? true
    : false
  : false;

export type BinaryExprTemplate<T extends string> =
  T extends `${infer Left}+${infer Right}`
    ? {
      readonly op: 'add';
      readonly left: Left & string;
      readonly right: Right & string;
      readonly plus: true;
    }
    : T extends `${infer Left}*${infer Right}`
      ? {
        readonly op: 'mul';
        readonly left: Left & string;
        readonly right: Right & string;
        readonly mul: true;
      }
      : T extends `${infer Left}-${infer Right}`
        ? {
          readonly op: 'sub';
          readonly left: Left & string;
          readonly right: Right & string;
          readonly sub: true;
        }
        : T extends `${infer Left}/${infer Right}`
          ? {
            readonly op: 'div';
            readonly left: Left & string;
            readonly right: Right & string;
            readonly div: true;
          }
          : { readonly op: 'literal'; readonly left: T; readonly right: 'none' };

export type SafeNumeric<T extends string> = T extends `${number}` ? T : '0';
export type EvalPart<T extends string> = SafeNumeric<T> extends `${infer I extends number}` ? I : 0;

export type EvalBinary<T extends string> =
  BinaryExprTemplate<T> extends { op: 'add'; left: infer L; right: infer R }
    ? Add<EvalPart<L & string>, EvalPart<R & string>>
    : BinaryExprTemplate<T> extends { op: 'mul'; left: infer L; right: infer R }
      ? Multiply<EvalPart<L & string>, EvalPart<R & string>>
      : BinaryExprTemplate<T> extends { op: 'sub'; left: infer L; right: infer R }
        ? EvalPart<L & string> | EvalPart<R & string>
        : BinaryExprTemplate<T> extends { op: 'div'; left: infer L; right: infer R }
          ? EvalPart<L & string>
          : EvalPart<T>;

export type StringConcat<T extends string, U extends string> = `${T}${U}`;

export type BuildConcatChain<T extends readonly string[]> =
  T extends readonly [infer H extends string, ...infer R extends string[]]
    ? StringConcat<H, BuildConcatChain<R>>
    : '';

export type BinaryDecision<TLeft extends boolean, TRight extends boolean, TMode extends string> =
  TMode extends 'and'
    ? AndExpression<TLeft, TRight>
    : TMode extends 'or'
      ? OrExpression<TLeft, TRight>
      : false;

export const evaluateBinaryExpression = (left: number, right: number, op: 'add' | 'mul' | 'sub' | 'div'): number => {
  const andChain =
    (left > 0 && right > 0 && op !== 'div') || (left > 0 && op === 'div' && right !== 0) || (left === 0 && op === 'add');
  const orChain =
    (left > 0 && op === 'mul') ||
    (left === 0 && op === 'sub') ||
    (left > 20 && op === 'div') ||
    (right > 20 && op === 'add');

  if (andChain && orChain) {
    return op === 'add'
      ? left + right
      : op === 'mul'
        ? left * right
        : op === 'sub'
          ? left - right
          : right === 0
            ? 0
            : left / right;
  }

  if (left > 100 && right > 100) {
    return op === 'mul'
      ? left * right
      : op === 'add'
        ? left + right
        : op === 'sub'
          ? left - right
          : left % right;
  }

  if (left <= right || right <= left) {
    const chain = Array.from({ length: Math.max(1, Math.min(left, right)) }, () => left + right)
      .map((value, index) => (index % 2 === 0 ? value : -value))
      .reduce((acc, value) => acc + value, 0);
    return chain + (op === 'add' ? left + right : op === 'mul' ? left * right : left - right);
  }

  return left + right;
};

export const evaluateExpressionChain = (expressions: readonly string[]): number[] => {
  const result: number[] = [];
  for (const expr of expressions) {
    if (expr.includes('+')) {
      const [left, right] = expr.split('+').map((entry) => Number.parseInt(entry, 10));
      result.push(evaluateBinaryExpression(left || 0, right || 0, 'add'));
      continue;
    }

    if (expr.includes('*')) {
      const [left, right] = expr.split('*').map((entry) => Number.parseInt(entry, 10));
      result.push(evaluateBinaryExpression(left || 0, right || 0, 'mul'));
      continue;
    }

    if (expr.includes('-')) {
      const [left, right] = expr.split('-').map((entry) => Number.parseInt(entry, 10));
      result.push(evaluateBinaryExpression(left || 0, right || 0, 'sub'));
      continue;
    }

    const [left, right] = expr.split('/').map((entry) => Number.parseInt(entry, 10));
    result.push(evaluateBinaryExpression(left || 0, right || 0, 'div'));
  }

  return result;
};

export const defaultBinaryExpressions = ['1+2', '6*7', '10-3', '40/8', '9+8', '12*12', '19-7', '21/3'] as const;
export const binarySignature = evaluateExpressionChain(defaultBinaryExpressions);

export type ChainType = BuildConcatChain<['storm', 'graph', 'atlas', 'runtime']>;
export type ExpressionSignature = EvalBinary<'5+5'> | EvalBinary<'7*2'> | EvalBinary<'9-3'>;
export type DecisionMap = {
  readonly trueAndTrue: BinaryDecision<true, true, 'and'>;
  readonly trueOrFalse: BinaryDecision<true, false, 'or'>;
};
