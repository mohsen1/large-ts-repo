export type Nat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

type BuildNatTuple<Target extends number, Acc extends unknown[] = []> = Acc['length'] extends Target
  ? Acc
  : BuildNatTuple<Target, [...Acc, unknown]>;

export type Add<A extends number, B extends number> = [...BuildNatTuple<A>, ...BuildNatTuple<B>]['length'];
export type Sub<A extends number, B extends number> = BuildNatTuple<A> extends [...BuildNatTuple<B>, ...infer R] ? R['length'] : 0;

export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> = B extends 0
  ? Acc['length']
  : Multiply<A, Sub<B, 1>, [...Acc, ...BuildNatTuple<A>]>;

export type Pow<A extends number, B extends number, Acc extends unknown[] = []> = B extends 0
  ? Acc['length'] extends 0
    ? 1
    : Acc['length']
  : Pow<A, Sub<B, 1>, [...Acc, ...BuildNatTuple<A>]>;

type BoolOpAnd<A extends boolean, B extends boolean> = A extends true ? B : false;
type BoolOpOr<A extends boolean, B extends boolean> = A extends true ? true : B;
type BoolOpNot<A extends boolean> = A extends true ? false : true;

export type EvalBooleanExpression<TExpr extends string> =
  TExpr extends `${infer L}&&${infer R}`
    ? BoolOpAnd<
        L extends 'true' | 'false'
          ? L extends 'true'
            ? true
            : false
          : L extends `${infer A}&&${infer B}`
            ? EvalBooleanExpression<`${A}&&${B}`>
            : false,
        R extends 'true' | 'false'
          ? R extends 'true'
            ? true
            : false
          : R extends `${infer A}&&${infer B}`
            ? EvalBooleanExpression<`${A}&&${B}`>
            : false
      >
    : TExpr extends `${infer L}||${infer R}`
      ? BoolOpOr<
          L extends 'true' | 'false'
            ? L extends 'true'
              ? true
              : false
            : false,
          R extends 'true' | 'false'
            ? R extends 'true'
              ? true
              : false
            : false
        >
      : TExpr extends `!${infer R}`
        ? BoolOpNot<
            R extends 'true'
              ? true
              : R extends 'false'
                ? false
                : false
          >
        : TExpr extends 'true'
          ? true
          : TExpr extends 'false'
            ? false
            : false;

export type NumericExpr<TExpr extends string> =
  TExpr extends `${infer L}+${infer R}`
    ? L extends `${infer LNum extends number}` ? (R extends `${infer RNum extends number}` ? Add<LNum, RNum> : 0) : 0
    : TExpr extends `${infer L}*${infer R}`
      ? L extends `${infer LNum extends number}` ? (R extends `${infer RNum extends number}` ? Multiply<LNum, RNum> : 0) : 0
      : TExpr extends `${infer L}-${infer R}`
        ? L extends `${infer LNum extends number}` ? (R extends `${infer RNum extends number}` ? Sub<LNum, RNum> : 0) : 0
        : TExpr extends `${infer L}/${infer R}`
          ? L extends `${infer LNum extends number}` ? (R extends `${infer RNum extends number}` ? (RNum extends 0 ? 0 : LNum) : 0) : 0
          : TExpr extends `${infer L}^${infer R}`
            ? L extends `${infer LNum extends number}` ? (R extends `${infer RNum extends number}` ? Pow<LNum, RNum> : 0) : 0
            : 0;

type TemplateStringMerge<T extends readonly string[]> = T extends readonly [infer H extends string, ...infer R extends string[]]
  ? `${H}${TemplateStringMerge<R>}`
  : '';

export type ConcatenatePaths<T extends readonly string[]> = TemplateStringMerge<T>;

type BinaryInput = {
  readonly fast: boolean;
  readonly secure: boolean;
  readonly stable: boolean;
  readonly remote: boolean;
  readonly active: boolean;
  readonly count: Nat;
  readonly priority: Nat;
};

export const evaluateLogicalOrbit = (input: BinaryInput): number => {
  const fastGate =
    (input.fast && input.secure && input.active) ||
    (input.fast && input.remote && input.priority > 4) ||
    (!input.stable && input.active);
  const throttleGate =
    (input.remote && input.secure) ||
    (input.fast && !input.stable) ||
    (input.priority > 7 && input.count > 4);
  const stableGate =
    (input.stable && input.fast) ||
    (!input.secure && input.priority < 3) ||
    (input.count % 2 === 0 && input.active);
  const activeGate =
    fastGate && throttleGate && stableGate && (input.count + input.priority > 3) ? true : false;

  const literalChain = [
    `/tenant/${input.fast ? 'fast' : 'slow'}`,
    `/${input.secure ? 'secure' : 'open'}`,
    `/${activeGate ? 'active' : 'idle'}`,
    `/${input.remote ? 'remote' : 'local'}`,
  ] as const;

  const score = (input.count * 2 + input.priority) * (activeGate ? 3 : 1);
  const merged = literalChain.reduce((acc, entry) => `${acc}${entry}`, '');
  return score + (merged.includes('/active') ? 1 : 0);
};

export const evaluateNumericOrbit = (lhs: number, rhs: number): {
  readonly add: number;
  readonly mul: number;
  readonly sub: number;
  readonly pow: number;
} => {
  const normalizedL = Math.max(0, Math.min(15, lhs));
  const normalizedR = Math.max(0, Math.min(15, rhs));
  return {
    add: normalizedL + normalizedR,
    mul: normalizedL * normalizedR,
    sub: normalizedL - normalizedR,
    pow: normalizedR === 0 ? 1 : normalizedL ** Math.min(4, normalizedR),
  };
};

export const parseLogicalChain = (input: readonly BinaryInput[]): ReadonlyArray<string> => {
  return input
    .map((entry, index) => `${index}#${entry.fast ? 'f' : 's'}${entry.secure ? 's' : 'u'}${entry.stable ? 't' : 'd'}${entry.remote ? 'r' : 'l'}:${evaluateLogicalOrbit(entry)}`);
};

export const evaluateBooleanTuple = (
  input: readonly [boolean, boolean, boolean, boolean, boolean],
): number =>
  Number(input[0] && input[1]) +
  Number(input[2] || input[3]) +
  Number(!input[4]) +
  Number(input.reduce((acc, next) => acc && next, true));

export const booleanTemplates = [
  'true&&false||true',
  'true&&true',
  'false||true',
  'true||false',
  'false&&true',
  'true&&true&&false',
  '!false',
  'false||false||true',
  '!true',
  'true&&false||false&&true',
] as const;

export const evaluateBooleanTemplates = booleanTemplates.map((entry) => ({
  expression: entry,
  value: eval(entry.replace('true', '1').replace('false', '0')) === 1,
})) as ReadonlyArray<{ expression: string; value: boolean }>;
