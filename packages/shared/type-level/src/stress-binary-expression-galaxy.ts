export type BoolLit = true | false;
export type NumLit = number;

export type BuildBoolTuple<N extends number, T extends readonly BoolLit[] = []> =
  T['length'] extends N ? T : BuildBoolTuple<N, [...T, true]>;

export type BuildNumTuple<N extends number, T extends readonly unknown[] = []> =
  T['length'] extends N ? T : BuildNumTuple<N, [...T, unknown]>;

export type BuildStrTuple<N extends number, T extends readonly string[] = []> =
  T['length'] extends N ? T : BuildStrTuple<N, [...T, `token-${N}-${T['length']}`]>;

export type Add<A extends number, B extends number> = [...BuildNumTuple<A>, ...BuildNumTuple<B>]['length'];

export type Multiply<A extends number, B extends number> =
  B extends 0
    ? 0
    : BuildNumTuple<A> extends infer Left
      ? Left extends readonly unknown[]
        ? Add<Left['length'], Multiply<A, Subtract<B, 1>>> 
        : never
      : never;

export type Subtract<A extends number, B extends number> = BuildNumTuple<A> extends [...infer Head, ...BuildNumTuple<B>]
  ? Head['length']
  : 0;

export type Power<A extends number, B extends number, Acc extends number = 1> =
  B extends 0
    ? Acc
    : Power<A, Subtract<B, 1>, Multiply<Acc, A>>;

export type BoolAndChain<T extends readonly BoolLit[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends true
    ? Tail extends readonly BoolLit[]
      ? BoolAndChain<Tail>
      : true
    : false
  : true;

export type BoolOrChain<T extends readonly BoolLit[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends true
    ? true
    : Tail extends readonly BoolLit[]
      ? BoolOrChain<Tail>
      : false
  : false;

export type NumericChain<T extends readonly number[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends number
    ? Tail extends readonly number[]
      ? Head | Add<Head, NumericChain<Tail> & number>
      : Head
    : never
  : 0;

export type NumericString<T extends string> = T extends `${infer N extends number}` ? N : never;

export type ChainTemplate<T extends readonly string[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? Tail extends readonly string[]
        ? `${Head}-${ChainTemplate<Tail & readonly string[] >}`
        : Head
      : never
    : '';

export type ParseSignal<T extends string> = T extends `${infer Left}:${infer Op}-${infer Right}`
  ? {
      left: Left;
      op: Op;
      right: Right;
    }
  : {
      raw: T;
      kind: 'raw';
    };

export type SignalMap<T extends readonly string[]> = {
  [K in keyof T as T[K] & string]: T[K] extends string
    ? T[K] extends `${infer A}-${infer B}`
      ? { left: A; right: B; hash: `${A}::${B}` }
      : { raw: T[K] }
    : never;
};

export type BinaryExprResult<T extends string> = T extends `${infer A}&&${infer B}`
  ? {
      lhs: A;
      rhs: B;
      op: 'and';
    }
  : T extends `${infer A}||${infer B}`
    ? {
        lhs: A;
        rhs: B;
        op: 'or';
      }
    : T extends `${infer A}+${infer B}`
      ? {
          lhs: NumericString<A>;
          rhs: NumericString<B>;
          op: 'plus';
          value: NumericString<A> | NumericString<B>;
        }
      : {
          literal: T;
        };

export type EvaluateBinary<T extends string> =
  T extends `${infer A}&&${infer B}`
    ? A extends '1'
      ? B extends '1'
        ? true
        : false
      : false
    : T extends `${infer A}||${infer B}`
      ? A extends '1'
        ? true
        : B extends '1'
          ? true
          : false
      : T extends `${infer A}+${infer B}`
        ? A extends `${infer _}`
          ? true
          : false
        : false;

export type ArithmeticChain<T extends readonly number[]> =
  T extends readonly [infer A, ...infer B]
    ? A extends number
      ? B extends readonly number[]
        ? Add<A, ArithmeticChain<B> & number>
        : A
      : never
    : 0;

export type BoolPipeline<T extends BoolLit[]> = {
  readonly and: BoolAndChain<T>;
  readonly or: BoolOrChain<T>;
  readonly tuple: T;
  readonly signature: T extends readonly BoolLit[] ? `len-${T['length']}` : never;
};

export type StringTemplateChain<T extends readonly string[], Out extends string = ''> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? Tail extends readonly string[]
        ? StringTemplateChain<Tail, `${Out}${Head}:${Tail['length']}-`>
        : Out
      : Out
    : Out;

export type BooleanExpressionSet =
  | '1&&1'
  | '1&&0'
  | '0&&1'
  | '0||1'
  | '1||0'
  | '0||0'
  | '1+1'
  | '2+3'
  | '4+5';

export type ParsedBooleanExpressionSet = {
  [K in BooleanExpressionSet]: BinaryExprResult<K>;
};

export type EvaluatedExpressionSet = {
  [K in BooleanExpressionSet]: EvaluateBinary<K>;
};

export const boolTuple = (n: number): BoolLit[] => Array.from({ length: n }, (_, i) => i % 2 === 0) as BoolLit[];

export const numTuple = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

export const exprChain = (parts: readonly string[]): string => {
  let out = '';
  for (const value of parts) {
    out = `${out}${value}::`;
  }
  return out;
};

export const evaluate = (raw: string): boolean => {
  if (raw.includes('&&')) {
    const [left, right] = raw.split('&&');
    return left === '1' && right === '1';
  }
  if (raw.includes('||')) {
    const [left, right] = raw.split('||');
    return left === '1' || right === '1';
  }
  if (raw.includes('+')) {
    const [left, right] = raw.split('+');
    return Number(left) + Number(right) > 0;
  }
  return raw.length > 0;
};

export const arithmeticSignature = <N extends number, L extends readonly number[]>(
  base: N,
  left: L,
): `sig-${N}-${L['length']}` => {
  return `sig-${base}-${left.length}` as `sig-${N}-${L['length']}`;
};

export const buildLogicMatrix = (
  levels: number,
): Array<EvaluatedExpressionSet[keyof EvaluatedExpressionSet]> => {
  const signals: BooleanExpressionSet[] = ['1&&1', '1&&0', '0||1', '1+1', '2+3'];
  const out: Array<EvaluatedExpressionSet[keyof EvaluatedExpressionSet]> = [];
  for (const value of signals) {
    const result = evaluate(value);
    out.push(result);
  }
  return out;
};

export type ChainSignature<T extends BoolLit[]> = {
  readonly signature: StringTemplateChain<T extends readonly true[] ? ['on', 'chain'] : ['off', 'chain']>;
  readonly score: T['length'];
};
