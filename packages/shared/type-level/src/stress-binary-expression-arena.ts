export type BoolLiteral = true | false;
export type SmallNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type NatTuple<N extends number, T extends readonly unknown[] = []> = T['length'] extends N
  ? T
  : NatTuple<N, [...T, unknown]>;

export type Add<A extends number, B extends number> = number;

export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> =
  B extends 0
    ? Acc['length']
    : Multiply<A, Decrement<B>, [...Acc, ...NatTuple<A>]>
;

export type Decrement<T extends number> = T extends 0
  ? 0
  : T extends 1
    ? 0
    : T extends 2
      ? 1
      : T extends 3
        ? 2
        : T extends 4
          ? 3
          : T extends 5
            ? 4
            : T extends 6
              ? 5
              : T extends 7
                ? 6
                : T extends 8
                  ? 7
                  : T extends 9
                    ? 8
                    : T extends 10
                      ? 9
                      : T extends 11
                        ? 10
                        : T extends 12
                          ? 11
                          : T extends 13
                            ? 12
                            : T extends 14
                              ? 13
                              : T extends 15
                                ? 14
                                : T extends 16
                                  ? 15
                                  : never;

export type IsZero<T extends number> = T extends 0 ? true : false;
export type LessThan<T extends number, U extends number, AT extends readonly unknown[] = NatTuple<T>, BU extends readonly unknown[] = NatTuple<U>> =
  AT extends readonly [infer _, ...infer ATail]
    ? BU extends readonly [infer _, ...infer BUtail]
      ? LessThan<ATail['length'], BUtail['length']>
      : false
    : BU extends readonly [infer _, ...infer _]
      ? true
      : false;

export type CompareLevel<A extends number, B extends number> =
  IsZero<A> extends true
    ? IsZero<B> extends true
      ? 'equal'
      : 'less'
    : IsZero<B> extends true
      ? 'greater'
      : LessThan<A, B> extends true
        ? 'less'
        : LessThan<B, A> extends true
          ? 'greater'
          : 'equal';

export type BuildExpr<T extends readonly BoolLiteral[]> =
  T extends readonly [infer H, ...infer R]
    ? H extends BoolLiteral
      ? R extends readonly BoolLiteral[]
        ? EvaluateBooleanChain<H, BuildExpr<R>>
        : H
      : never
    : true;

export type EvaluateBooleanChain<Left extends BoolLiteral, Right extends BoolLiteral> = Left extends true ? Right : false;

export type ArithmeticGate<T extends readonly number[]> =
  T extends readonly [infer A extends number, infer B extends number, ...infer Rest extends readonly number[]]
    ? Rest extends readonly []
      ? Add<A, B>
      : number
    : T extends readonly [infer A extends number]
      ? A
      : 0;

export interface BinaryInput {
  readonly fast: boolean;
  readonly secure: boolean;
  readonly stable: boolean;
  readonly remote: boolean;
  readonly active: boolean;
  readonly count: SmallNumber;
  readonly priority: SmallNumber;
}

export interface BinaryOutput {
  readonly accepted: boolean;
  readonly score: number;
  readonly token: string;
  readonly risk: 'less' | 'equal' | 'greater';
}

export type ExpressionChain<T extends BinaryInput> =
  T['fast'] extends true
    ? T['secure'] extends true
      ? T['stable'] extends true
        ? T['remote'] extends true
          ? T['active'] extends true
            ? 'A'
            : 'B'
          : 'C'
        : 'D'
      : T['active'] extends true
        ? 'E'
        : 'F'
    : T['stable'] extends true
      ? T['remote'] extends true
        ? 'G'
        : 'H'
      : 'I';

export type ChainDecision<T extends BranchCode> =
  T extends 'A'
    ? { readonly accepted: true; readonly quality: 'high'; readonly penalty: 0 }
    : T extends 'B'
      ? { readonly accepted: true; readonly quality: 'medium'; readonly penalty: 1 }
      : T extends 'C'
        ? { readonly accepted: true; readonly quality: 'medium'; readonly penalty: 2 }
        : T extends 'D'
          ? { readonly accepted: false; readonly quality: 'low'; readonly penalty: 3 }
          : T extends 'E'
            ? { readonly accepted: true; readonly quality: 'medium'; readonly penalty: 1 }
            : T extends 'F'
              ? { readonly accepted: false; readonly quality: 'low'; readonly penalty: 4 }
              : T extends 'G'
                ? { readonly accepted: true; readonly quality: 'medium'; readonly penalty: 2 }
                : { readonly accepted: false; readonly quality: 'critical'; readonly penalty: 10 };

export type BranchCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export type BoolGate<T extends BinaryInput> = T['fast'] extends true
  ? T['secure'] extends true
    ? T['stable']
    : T['active']
  : T['remote'] extends false
    ? T['active']
    : false;

export const boolChain = (input: BinaryInput): BinaryOutput => {
  const score =
    (input.fast ? 1 : 0) +
    (input.secure ? 2 : 0) +
    (input.stable ? 3 : 0) +
    (input.remote ? 4 : 0) +
    (input.active ? 5 : 0);

  const expr1 = input.fast && input.secure && input.stable && input.remote;
  const expr2 = input.fast && input.secure && input.active;
  const expr3 = input.fast && input.remote && input.count > 0 && input.priority > 1;
  const expr4 = input.secure && !input.remote && input.stable;
  const expr5 = input.count > 0 && input.priority > 0 && input.fast;
  const expr6 = input.active || (!input.remote && input.stable);
  const expr7 = input.priority > 5 || (input.fast && input.secure);
  const expr8 = input.count > 3 && input.stable && !input.remote;
  const expr9 = input.remote || input.secure || input.active;
  const expr10 = input.fast && (expr1 || expr2 || expr3 || expr4);

  const chain: BranchCode = input.fast && input.secure && input.stable && input.remote && input.active
    ? 'A'
    : input.fast && input.secure
      ? 'B'
      : 'I';
  const penalties: Readonly<Record<BranchCode, number>> = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 1,
    F: 4,
    G: 2,
    H: 2,
    I: 10,
  };
  const penalty = penalties[chain];
  const accepted = !!(
    (expr1 && expr2) ||
    (expr10 && expr5) ||
    (expr3 && expr6) ||
    (expr4 && expr7) ||
    (expr8 && expr9 && expr2) ||
    (expr10 && expr6)
  );

  return {
    accepted,
    score: score + penalty,
    token: `token-${input.count}-${input.priority}-${chain}`,
    risk: compareRatios(input.count, input.priority),
  };
};

export type GateOutput = ReturnType<typeof boolChain>;

export const evaluateLogicalChain = (input: BinaryInput): GateOutput => {
  const checks = [
    input.fast,
    input.secure,
    input.stable,
    input.remote,
    input.active,
    input.count > 3,
    input.count < 9,
    input.priority > 0,
    input.priority < 9,
  ];

  const all = checks.reduce<boolean>((acc, check) => acc && check, true);
  const some = checks.reduce<boolean>((acc, check) => acc || check, false);
  const mixed = checks.reduce((acc, check) => {
    if (acc && check) {
      return false;
    }
    if (!acc && check) {
      return true;
    }
    return acc;
  }, false);
  const final = all && some && mixed;
  const token = `${String(final)}-${String(all)}-${String(some)}`;

  return {
    accepted: final,
    score: checks.length,
    token,
    risk: token.length > 10 ? 'greater' : 'equal',
  };
};

export const numericPipe = <const T extends readonly SmallNumber[]>(values: T): number => {
  let value = 0;
  for (const next of values) {
    value = (value + next) % 10;
  }
  return value;
};

export const chainTuple = <const T extends readonly SmallNumber[]>(values: T): ArithmeticGate<T> => {
  if (values.length === 0) {
    return 0 as ArithmeticGate<T>;
  }
  const sum = values.reduce((acc: SmallNumber, value: SmallNumber) => ((acc + value) % 10) as SmallNumber, 0 as SmallNumber);
  return sum as ArithmeticGate<T>;
};

export const compareRatios = (left: SmallNumber, right: SmallNumber): 'less' | 'equal' | 'greater' => {
  const l = Number(left);
  const r = Number(right);
  if (l < r) {
    return 'less';
  }
  if (l > r) {
    return 'greater';
  }
  return 'equal';
};

export const longStringExpr = (...input: boolean[]): boolean => {
  return (
    (input[0] && input[1]) ||
    (input[2] && input[3]) ||
    (input[4] && input[5]) ||
    (input[6] && input[7]) ||
    (input[8] && input[9]) ||
    (input[10] && input[11]) ||
    (input[12] && input[13]) ||
    (input[14] && input[15]) ||
    (input[16] && input[17]) ||
    (input[18] && input[19]) ||
    (input[20] && input[21]) ||
    (input[22] && input[23]) ||
    (input[24] && input[25]) ||
    (input[26] && input[27]) ||
    (input[28] && input[29])
  );
};

export const buildBooleanMatrix = (size: number): boolean[] => {
  const out: boolean[] = [];
  for (let i = 0; i < size; i += 1) {
    out.push(i % 2 === 0);
  }
  return out;
};

export const evaluateBooleanArena = (size: number): GateOutput => {
  const arr = buildBooleanMatrix(size);
  return boolChain({
    fast: arr[0] ?? false,
    secure: arr[1] ?? false,
    stable: arr[2] ?? false,
    remote: arr[3] ?? false,
    active: arr[4] ?? true,
    count: (size % 10) as SmallNumber,
    priority: ((size + 2) % 10) as SmallNumber,
  });
};
