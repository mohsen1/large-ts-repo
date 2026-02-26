export type BoolLit = true | false;

export type BuildBoolTuple<N extends number, T extends BoolLit[] = []> = T['length'] extends N ? T : BuildBoolTuple<N, [...T, true]>;
export type BoolAndTuple<T extends readonly BoolLit[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends true
    ? Tail extends readonly BoolLit[]
      ? BoolAndTuple<Tail>
      : false
    : false
  : true;
export type BoolOrTuple<T extends readonly BoolLit[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends true
    ? true
    : Tail extends readonly BoolLit[]
      ? BoolOrTuple<Tail>
      : false
  : false;
export type BuildNumericTuple<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : BuildNumericTuple<N, [...T, unknown]>;
export type AddTuple<A extends number, B extends number> = [...BuildNumericTuple<A>, ...BuildNumericTuple<B>]['length'];
export type Subtract<A extends number, B extends number> = BuildNumericTuple<A> extends [...BuildNumericTuple<B>, ...infer R] ? R['length'] : never;
export type Multiply<A extends number, B extends number> = BuildNumericTuple<A> extends infer Left
  ? Left extends unknown[]
    ? (B extends 0 ? 0 : A extends 0 ? 0 : Multiply<A, Subtract<B, 1>>)
    : never
  : never;

export type LogicalChain<
  A extends BoolLit,
  B extends BoolLit,
  C extends BoolLit,
  D extends BoolLit,
> = A extends true ? (B extends true ? (C extends true ? (D extends true ? true : false) : false) : false) : false;

export type RouteLogic<A extends string> = A extends `${infer Left}/${infer Right}` ? `${Left}-${Right}` : `${A}`;
export type BinaryTemplate<T extends string> = `${T}:${T}`;
export type InvertBoolean<T extends BoolLit> = T extends true ? false : true;

export type TupleArithmetic<
  A extends number,
  B extends number,
  ACount extends unknown[] = BuildNumericTuple<A>,
  BCount extends unknown[] = BuildNumericTuple<B>,
> = ACount['length'] extends infer AL extends number
  ? BCount['length'] extends infer BL extends number
    ? AddTuple<AL, BL>
    : never
  : never;

type Guarded<T> = [T][T extends any ? 0 : never];
export type SafeBooleanSequence<T extends readonly BoolLit[]> = Guarded<T> extends readonly BoolLit[] ? BoolAndTuple<T> : false;

export type RouteInference<T extends string> =
  T extends `${infer Prefix}-${infer Suffix}` ? { prefix: Prefix; suffix: Suffix } : { raw: T };

export type RouteChain<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? [RouteInference<Head>, ...RouteChain<Tail & readonly string[]>]
    : []
  : [];

export const boolChecks = [
  () => true,
  () => false,
  () => 1 > 0,
  () => 'alpha'.includes('a'),
  () => Number.isFinite(42),
  () => [1, 2, 3].length > 2,
  () => typeof JSON !== 'undefined',
  () => 'ok'.startsWith('o'),
  () => new Date().getTime() > 0,
] as const;

export const buildBinaryChain = (operands: readonly boolean[]): boolean => {
  const [first, second, third, fourth, fifth] = operands;
  return (
    ((first && second && third) || (second || third)) &&
    ((fourth || !third) && (!(first || second) || third)) &&
    ((fifth ?? false) || true) &&
    ((fourth && first) || (first && second) || (third && second))
  );
};

export const buildArithmeticTuple = (value: number): string[] => {
  const values = Array.from({ length: value });
  return values.map((_, index) => `${index}:${index + value}`);
};

export const evaluateBinaryWorkload = (steps: readonly boolean[]) => {
  const and = steps.reduce<boolean>((memo, value) => memo && value, true);
  const or = steps.reduce<boolean>((memo, value) => memo || value, false);
  const signature = steps.map((value, index) => `${index}:${value ? 'T' : 'F'}`).join('|');
  return { and, or, signature };
};

export const chainToTemplate = (value: string, levels: number): string[] => {
  const outputs: string[] = [];
  for (let index = 0; index < levels; index += 1) {
    outputs.push(index % 2 === 0 ? `${value}/${index}` : `${index}:${value}`);
  }
  return outputs;
};

export type BinaryTemplateRecord<T extends readonly boolean[]> = {
  [K in keyof T]: T[K] extends true ? RouteLogic<'true'> : RouteLogic<'false'>;
};

export type NormalizeBinaryArray<T extends readonly boolean[]> = T[number] extends true
  ? 'all-true'
  : T[number] extends false
    ? 'all-false'
    : 'mixed';

export const inferBooleanRoute = <T extends string>(route: T): RouteInference<T> => {
  if (route.includes('-')) {
    const [prefix, suffix] = route.split('-');
    return { prefix, suffix } as RouteInference<T>;
  }
  return { raw: route } as RouteInference<T>;
};
