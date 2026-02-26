import type { Brand } from './patterns';

export type BuildNatural<N extends number, Acc extends unknown[] = []> = Acc['length'] extends N
  ? Acc
  : BuildNatural<N, [...Acc, Acc['length']]>;

export type Decrement<N extends number> = BuildNatural<N> extends [infer _, ...infer Rest] ? Rest['length'] : 0;

export type Add<A extends number, B extends number> = [...BuildNatural<A>, ...BuildNatural<B>]['length'];
export type Multiply<A extends number, B extends number, Acc extends unknown[] = []> = B extends 0
  ? Acc['length']
  : Multiply<A, Decrement<B>, [...BuildNatural<A>, ...Acc]>;

export type Subtract<A extends number, B extends number> = BuildNatural<A> extends [
  ...infer Head,
  ...BuildNatural<B>
]
  ? Head['length']
  : 0;

export type CompareTuple<T extends readonly unknown[], U extends readonly unknown[]> = T['length'] extends U['length']
  ? true
  : false;

export type IsGreaterThan<A extends number, B extends number> = BuildNatural<A> extends [...BuildNatural<B>, ...infer R]
  ? R['length'] extends 0
    ? false
    : true
  : false;

export type BinaryExpression<T extends string> = T extends `${infer Left}&&${infer Right}`
  ? {
      readonly operator: '&&';
      readonly left: Left;
      readonly right: Right;
    }
  : T extends `${infer Left}||${infer Right}`
    ? {
        readonly operator: '||';
        readonly left: Left;
        readonly right: Right;
      }
    : T extends `${infer Left}+${infer Right}`
      ? {
          readonly operator: 'plus';
          readonly left: Left;
          readonly right: Right;
        }
      : T extends `${infer Left}-${infer Right}`
        ? {
            readonly operator: 'minus';
            readonly left: Left;
            readonly right: Right;
          }
        : never;

export type EvalBinary<E extends BinaryExpression<string>> =
  E extends { readonly operator: '&&'; readonly left: infer Left; readonly right: infer Right }
    ? Left extends `${infer L}`
      ? Right extends `${infer R}`
        ? `${L}&&${R}`
        : never
      : never
    : E extends { readonly operator: '||'; readonly left: infer Left; readonly right: infer Right }
      ? Left extends `${infer L}`
        ? Right extends `${infer R}`
          ? `${L}||${R}`
          : never
        : never
      : E extends { readonly operator: 'plus'; readonly left: infer Left; readonly right: infer Right }
        ? Left extends `${infer L}`
          ? Right extends `${infer R}`
            ? `${L}+${R}`
            : never
          : never
        : E extends { readonly operator: 'minus'; readonly left: infer Left; readonly right: infer Right }
          ? Left extends `${infer L}`
            ? Right extends `${infer R}`
              ? `${L}-${R}`
              : never
            : never
          : never;

export type BinaryChain =
  | 'a&&b&&c&&d'
  | 'a||b||c'
  | 'x&&y||z'
  | 'alpha+beta+gamma'
  | '100-20'
  | 'token-1&&token-2||token-3';

export type ParsedBinary = BinaryExpression<BinaryChain>;
export type BinaryCatalog = {
  [K in BinaryChain]: BinaryExpression<K>;
};

export type TemplateExpr = `${number}-${number}-${number}` | `${string}+${string}` | `${string}&&${string}`;
export type ParseTemplate<T extends TemplateExpr> = T extends `${infer A}-${infer B}-${infer C}`
  ? { readonly left: A; readonly right: B; readonly final: C }
  : T extends `${infer A}+${infer B}`
    ? { readonly left: A; readonly right: B }
    : T extends `${infer A}&&${infer B}`
      ? { readonly left: A; readonly right: B }
      : never;

export const binaryChain = [
  'a&&b&&c&&d',
  'a||b||c',
  'x&&y||z',
  'alpha+beta+gamma',
  '100-20',
  'token-1&&token-2||token-3',
] as const satisfies readonly BinaryChain[];

const toTuple = (value: string): string[] => value.split('');

export const evaluateBinaryExpression = (left: number, right: number, op: '&&' | '||' | '+' | '-'): number => {
  if (op === '&&') {
    return left && right;
  }
  if (op === '||') {
    return left || right;
  }
  if (op === '+') {
    return left + right;
  }
  return left - right;
};

export const evaluateChain = (seed: number): {
  readonly values: number[];
  readonly result: number;
  readonly labels: readonly Brand<string, 'binary-label'>[];
} => {
  let aggregate = seed;
  const values: number[] = [seed];
  const labels = [] as Brand<string, 'binary-label'>[];
  for (const raw of binaryChain) {
    if (raw.includes('&&')) {
      const [left, right] = raw.split('&&').map(Number);
      const evaluated = evaluateBinaryExpression(Number.isNaN(left) ? aggregate : left, Number.isNaN(right) ? aggregate : right, '&&');
      aggregate += evaluated;
      values.push(evaluated);
      labels.push(`and:${raw}` as Brand<string, 'binary-label'>);
      continue;
    }
    if (raw.includes('||')) {
      const [left, right] = raw.split('||').map(Number);
      const evaluated = evaluateBinaryExpression(Number.isNaN(left) ? aggregate : left, Number.isNaN(right) ? aggregate : right, '||');
      aggregate = evaluated;
      values.push(evaluated);
      labels.push(`or:${raw}` as Brand<string, 'binary-label'>);
      continue;
    }
    if (raw.includes('+')) {
      const [left, right] = raw.split('+').map((value) => Number(value));
      aggregate = evaluateBinaryExpression(Number.isNaN(left) ? aggregate : left, Number.isNaN(right) ? aggregate : right, '+');
      values.push(aggregate);
      labels.push(`add:${raw}` as Brand<string, 'binary-label'>);
      continue;
    }
    const [left, right] = raw.split('-').map((value) => Number(value));
    aggregate = evaluateBinaryExpression(Number.isNaN(left) ? aggregate : left, Number.isNaN(right) ? aggregate : right, '-');
    values.push(aggregate);
    labels.push(`sub:${raw}` as Brand<string, 'binary-label'>);
  }

  for (const item of values) {
    const [first] = toTuple(String(item));
    if (first && first > '9') {
      aggregate += item;
    }
  }

  return { values, result: aggregate, labels };
};

export const parseTemplateExpression = (expression: TemplateExpr): ParseTemplate<TemplateExpr> => {
  const parsed = expression.includes('-')
    ? { left: 'L', right: 'R', final: 'F' }
    : expression.includes('+')
      ? { left: 'L', right: 'R' }
      : { left: 'L', right: 'R' };

  return parsed as ParseTemplate<TemplateExpr>;
};
