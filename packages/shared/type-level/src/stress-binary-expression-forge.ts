export type DepthMarker = `depth-${number}`;

export type BoolToken = 'true' | 'false';
export type BoolValue = true | false;

export type BoolTruth<T extends BoolToken> = T extends 'true' ? true : false;

export type BoolEvalNode<T extends string> = T extends `${infer A}&&${infer B}`
  ? BoolTruth<A & BoolToken> extends true
    ? BoolEvalNode<B>
    : false
  : T extends `${infer A}||${infer B}`
    ? BoolTruth<A & BoolToken> extends true
      ? true
      : BoolEvalNode<B>
    : BoolTruth<T & BoolToken>;

export type BoolEval<T extends string> = BoolEvalNode<T>;

export type LiteralToken<T extends string> = T extends `${infer A}-${infer B}-${infer C}`
  ? [A, B, C]
  : T extends `${infer A}-${infer B}`
    ? [A, B]
    : [T];

export type ReduceBooleanTuple<T extends string> = T extends `${infer A}&&${infer B}`
  ? [BoolTruth<A & BoolToken>, ...ReduceBooleanTuple<B>]
  : T extends `${infer A}||${infer B}`
    ? [BoolTruth<A & BoolToken>, ...ReduceBooleanTuple<B>]
    : [BoolTruth<T & BoolToken>];

export type JoinWithColon<T extends readonly string[]> = T extends readonly []
  ? ''
  : T extends readonly [infer H]
    ? H & string
    : T extends readonly [infer H, ...infer R]
      ? `${H & string}::${JoinWithColon<Extract<R, readonly string[]>>}`
      : '';

export type ExpressionParser<T extends string, Depth extends number = 0> = Depth extends 5
  ? T
  : T extends `${infer L}+${infer R}`
    ? { readonly operator: 'plus'; readonly left: L; readonly right: ExpressionParser<R, Depth | 1> }
    : T extends `${infer L}-${infer R}`
      ? { readonly operator: 'minus'; readonly left: L; readonly right: ExpressionParser<R, Depth | 1> }
      : { readonly operator: 'literal'; readonly value: T };

export type NumberLit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type NumericResult<T extends string> = T extends '3+6-2+8'
  ? 15
  : T extends '12-7+1'
    ? 6
    : T extends '4+5+6+1'
      ? 16
      : T extends '1+2+3+4'
        ? 10
        : T extends '9-3-1'
          ? 5
          : T extends '7+1-2+5'
            ? 11
            : number;

export type StringConcatExpression<T extends string> = T extends `${infer A}|${infer B}`
  ? `${A}-${StringConcatExpression<B>}`
  : T;

export type NumericCascade =
  | `sum:${NumericResult<'3+6-2+8'>}`
  | `sum:${NumericResult<'12-7+1'>}`
  | `sum:${NumericResult<'4+5+6+1'>}`;

export type ExpressionSet = {
  readonly arithmetics: [NumericCascade, NumericCascade, NumericCascade];
  readonly booleans: [BoolEval<'true&&true||false'>, BoolEval<'false&&true||true'>, BoolEval<'true||false&&true'>];
  readonly parsed: [LiteralToken<'A-B-C'>, LiteralToken<'node::1::2'>];
  readonly flatten: [ReduceBooleanTuple<'true&&false||true'>, ReduceBooleanTuple<'false||true'>];
  readonly chainA: ExpressionParser<'1+2+3+4'>;
  readonly chainB: ExpressionParser<'9-3-1'>;
  readonly chainC: ExpressionParser<'7+1-2+5'>;
  readonly concat: StringConcatExpression<'A|B|C|D'>;
  readonly markers: [DepthMarker, DepthMarker];
};

export const expressionCatalog = [
  '1+2+3+4',
  'true&&false||true',
  '3-1-2',
  '6+9-3',
  'A|B|C|D',
] as const;

type ExpressionCell = (typeof expressionCatalog)[number];

export type ExpressionCatalogRow<T extends ExpressionCell> = {
  readonly token: T;
  readonly marker: `expr:${T}`;
};

export const expressionCatalogParsed = expressionCatalog.map((entry) => ({
  token: entry,
  marker: `expr:${entry}` as const,
  arity: entry.includes('+') ? 'arith' : entry.includes('-') ? 'arith' : 'logic',
  evaluated:
    entry === '1+2+3+4'
      ? ('10' as const)
      : entry === '3-1-2'
        ? ('0' as const)
        : entry === '6+9-3'
          ? ('12' as const)
          : entry.includes('|')
            ? ('str' as const)
            : ('bool' as const),
})) satisfies readonly ExpressionCatalogRow<ExpressionCell>[];
