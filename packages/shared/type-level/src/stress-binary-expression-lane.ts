export type Bit = 0 | 1;

export type NatToken =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

export type NatToTuple<T extends NatToken, TAcc extends unknown[] = []> =
  TAcc['length'] extends T ? TAcc : NatToTuple<T, [...TAcc, unknown]>;

export type AddNat<A extends NatToken, B extends NatToken> = [...NatToTuple<A>, ...NatToTuple<B>]['length'];
export type SubNat<A extends NatToken, B extends NatToken> = NatToTuple<A> extends [infer _, ...infer RestA]
  ? NatToTuple<B> extends [infer _, ...infer RestB]
    ? RestA['length'] extends never
      ? 0
      : RestB['length'] extends never
        ? RestA['length']
        : SubNat<RestA['length'] & NatToken, RestB['length'] & NatToken>
    : 0
  : 0;

export type MulNat<A extends NatToken, B extends NatToken, Acc extends unknown[] = []> =
  B extends 0
    ? Acc['length']
    : MulNat<A, SubNat<B, 1>, [...NatToTuple<A>, ...Acc]>;

export type BinaryOp = '+' | '-' | '*' | '|' | '&&' | '||';

export type Tokenize<T extends string> = T extends `${infer Left} ${infer Right}`
  ? [Left, ...Tokenize<Right>]
  : [T];

export type ParseAtom<T> = T extends `${infer A}+${infer B}`
  ? [A, '+', B]
  : T extends `${infer A}-${infer B}`
    ? [A, '-', B]
    : T extends `${infer A}*${infer B}`
      ? [A, '*', B]
      : T extends `${infer A}||${infer B}`
        ? [A, '||', B]
        : T extends `${infer A}&&${infer B}`
          ? [A, '&&', B]
          : [T, never, never];

export type EvaluateNumeric<T extends string> = ParseAtom<T> extends [
  infer A,
  '+',
  infer B,
]
  ? A extends `${infer LA}`
    ? B extends `${infer LB}`
      ? LA extends NatToken
        ? LB extends NatToken
          ? AddNat<LA, LB>
          : never
        : never
      : never
    : never
  : ParseAtom<T> extends [
      infer A,
      '-',
      infer B,
    ]
    ? A extends `${infer LA}`
      ? B extends `${infer LB}`
        ? LA extends NatToken
          ? LB extends NatToken
            ? SubNat<LA, LB>
            : never
          : never
        : never
      : never
    : ParseAtom<T> extends [
        infer A,
        '*',
        infer B,
      ]
      ? A extends `${infer LA}`
        ? B extends `${infer LB}`
          ? LA extends NatToken
            ? LB extends NatToken
              ? MulNat<LA, LB>
              : never
            : never
          : never
        : never
      : ParseAtom<T> extends [infer A, '||', infer B]
        ? A extends '1' | '0'
          ? B extends '1' | '0'
            ? B
            : never
          : never
        : ParseAtom<T> extends [infer A, '&&', infer B]
          ? A extends '1' | '0'
            ? B extends '1' | '0'
              ? A
              : never
            : never
          : never;

export type ExpressionRoute<T extends string> = T extends `${infer A}/${infer B}/${infer C}`
  ? {
      readonly domain: A;
      readonly action: B;
      readonly scope: C;
    }
  : never;

export type PathToLabel<T extends string> = T extends `${infer D}/${infer A}/${infer S}`
  ? `${D}_${A}_${S}`
  : never;

export type RouteExpression<T extends string> = T extends `${infer Route}:${infer Expr}`
  ? {
      readonly route: ExpressionRoute<Route>;
      readonly expr: PathToLabel<Expr>;
      readonly value: EvaluateNumeric<Expr>;
    }
  : never;

export type ExpressionCatalog<TRows extends readonly string[]> = {
  [K in keyof TRows]: TRows[K] extends string ? RouteExpression<TRows[K]> : never;
};

export const evaluateExpressionChain = (
  ...rows: readonly string[]
): Array<{ route: string; result: string; ok: boolean }> => {
  return rows.map((row) => {
    let result = 0;
    let ok = false;
    if (row.includes('+')) {
      const [left, right] = row.split(':')[1]?.split('+') ?? [];
      const parsedLeft = Number(left);
      const parsedRight = Number(right);
      result = Number.isNaN(parsedLeft) || Number.isNaN(parsedRight) ? 0 : parsedLeft + parsedRight;
      ok = true;
    } else if (row.includes('-')) {
      const [left, right] = row.split(':')[1]?.split('-') ?? [];
      const parsedLeft = Number(left);
      const parsedRight = Number(right);
      result = Number.isNaN(parsedLeft) || Number.isNaN(parsedRight) ? 0 : parsedLeft - parsedRight;
      ok = true;
    } else if (row.includes('*')) {
      const [left, right] = row.split(':')[1]?.split('*') ?? [];
      const parsedLeft = Number(left);
      const parsedRight = Number(right);
      result = Number.isNaN(parsedLeft) || Number.isNaN(parsedRight) ? 0 : parsedLeft * parsedRight;
      ok = true;
    }

    return { route: row.split(':')[0] ?? row, result: String(result), ok };
  });
};

export const compileBooleanRouteExpression = <T extends string>(
  expression: T,
  context: {
    readonly hasRoute: boolean;
    readonly isActive: boolean;
    readonly isStable: boolean;
    readonly errorCode: number;
  },
): boolean => {
  const hasPath = expression.length > 0;
  const parsed = expression.includes('&&') || expression.includes('||');

  if (!hasPath) {
    return false;
  }

  if (expression.includes('||')) {
    return (context.hasRoute && parsed) || (context.isActive && context.errorCode < 10) || context.isStable;
  }

  if (expression.includes('&&')) {
    return context.hasRoute && parsed && context.errorCode >= 0 && context.isActive && context.isStable;
  }

  return parsed && (context.hasRoute || context.isActive);
};

export const renderExpressionPlan = (route: string, value: number) => {
  const safe = Math.max(0, Math.min(20, value));
  const steps = Array.from({ length: safe }, (_, index) => `${route}:${index}`);
  const checks = evaluateExpressionChain(...steps);
  return {
    route,
    total: checks.length,
    active: checks.filter((item) => item.ok).length,
    values: checks,
  };
};
