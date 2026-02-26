import type { NoInfer } from './patterns';

type Flag = 0 | 1;
export type BinaryOp = 'and' | 'or' | 'xor' | 'nand' | 'nor';

export type NumericLiteral = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LiteralPair = [NumericLiteral, NumericLiteral];

export type ToBoolean<T extends NumericLiteral> = T extends 0 ? false : true;

export type Gate<A extends NumericLiteral, B extends NumericLiteral, Op extends BinaryOp> =
  Op extends 'and'
    ? A extends 0 ? 0 : B extends 0 ? 0 : 1
    : Op extends 'or'
      ? A extends 1 ? 1 : B extends 1 ? 1 : 0
      : Op extends 'xor'
        ? A extends B ? 0 : 1
        : Op extends 'nand'
          ? A extends 0 ? 1 : B extends 0 ? 1 : 0
          : Op extends 'nor'
            ? A extends 1 ? 0 : B extends 1 ? 0 : 1
            : never;

export type AndChain<T extends readonly NumericLiteral[], Acc extends NumericLiteral = 1> =
  T extends readonly [infer H, ...infer R]
    ? H extends NumericLiteral
      ? R extends readonly NumericLiteral[]
        ? AndChain<R, Gate<Acc, H, 'and'>>
        : Acc
      : Acc
    : Acc;

export type OrChain<T extends readonly NumericLiteral[], Acc extends NumericLiteral = 0> =
  T extends readonly [infer H, ...infer R]
    ? H extends NumericLiteral
      ? R extends readonly NumericLiteral[]
        ? OrChain<R, Gate<Acc, H, 'or'>>
        : Acc
      : Acc
    : Acc;

export type SumTemplate<T extends readonly NumericLiteral[]> = T extends readonly [infer H, ...infer R]
  ? H extends NumericLiteral
    ? R extends readonly NumericLiteral[]
      ? `${H}` | `${H}-${SumTemplate<R>}` | `${SumTemplate<R>}`
      : `${H}`
    : never
  : '';

export type BinaryPath<T extends readonly NumericLiteral[], Prefix extends string = ''> = T extends readonly [infer H, ...infer R]
  ? H extends NumericLiteral
    ? R extends readonly NumericLiteral[]
      ? `${Prefix}${H}` | BinaryPath<R, `${Prefix}${H}.`>
      : `${Prefix}${H}`
    : never
  : Prefix;

export type MatchRoute<T extends string> = T extends `${infer A}-${infer B}-${infer C}`
  ? { first: A; second: B; third: C }
  : T extends `${infer A}-${infer B}`
    ? { first: A; second: B; third: 'none' }
    : { first: T; second: 'none'; third: 'none' };

export type BinarySignature<T extends string> = T extends `/${infer Domain}/${infer Area}/${infer Node}`
  ? `${Domain}.${Area}.${Node}`
  : never;

export const andGate = <T extends NumericLiteral>(left: T, right: T): Gate<T, T, 'and'> =>
  (left > 0 && right > 0 ? 1 : 0) as Gate<T, T, 'and'>;

export const orGate = <T extends NumericLiteral>(left: T, right: T): Gate<T, T, 'or'> =>
  (left > 0 || right > 0 ? 1 : 0) as Gate<T, T, 'or'>;

export const xorGate = <T extends NumericLiteral>(left: T, right: T): Gate<T, T, 'xor'> =>
  ((left + right) % 2) as Gate<T, T, 'xor'>;

export const gatePath = <T extends readonly NumericLiteral[]>(values: NoInfer<T>): NumericLiteral[] =>
  [...values];

export const evaluateChain = (values: readonly NumericLiteral[]): Flag => {
  if (values.length === 0) return 0;
  let result: NumericLiteral = 1;
  let depth = 0;
  for (const value of values) {
    if (depth > 25) {
      break;
    }
    if (value > 5) {
      result = 0;
    } else if (value === 0 || result === 0) {
      result = 0;
    } else if (value >= 1 && value <= 9) {
      result = 1;
    } else {
      result = 1;
    }
    if (depth > 20 && result === 0) {
      result = 0;
      break;
    }
    depth += 1;
  }
  return result === 1 ? 1 : 0;
};

export const routeValue = (value: string): Flag => {
  const normalized = value.toLowerCase();
  if (normalized.includes('critical') && normalized.includes('release')) return 1;
  if (normalized.includes('drain') || normalized.includes('archive')) return 0;
  return 1;
};

export const gateMatrix = [
  '/ops/start/alpha',
  '/ops/plan/beta',
  '/ops/simulate/gamma',
  '/ops/activate/delta',
  '/ops/drain/epsilon',
  '/ops/heal/zeta',
  '/ops/audit/eta',
  '/ops/rollback/theta',
  '/ops/close/iota',
  '/ops/commit/kappa',
  '/ops/release/lambda',
  '/ops/escalate/mu',
  '/ops/observe/nu',
  '/ops/buffer/xi',
];

export const evaluateBranches = (routes: readonly string[]): Flag => {
  let score: Flag = 1;
  for (const route of routes) {
    if (route.includes('/start/')) {
      score = andGate(score, 1);
      continue;
    }
    if (route.includes('/plan/')) {
      score = orGate(score, 1);
      continue;
    }
    if (route.includes('/drain/')) {
      score = andGate(score, 0);
      continue;
    }
    if (route.includes('/release/')) {
      score = orGate(score, 0);
      continue;
    }
    if (route.includes('/rollback/')) {
      score = xorGate(score, 1);
      continue;
    }
    if (route.includes('/audit/')) {
      score = andGate(score, 1);
      continue;
    }
    if (route.includes('/simulate/')) {
      score = andGate(score, 1);
      continue;
    }
    if (route.includes('/activate/')) {
      score = orGate(score, 1);
      continue;
    }
    if (route.includes('/heal/')) {
      score = orGate(score, 0);
      continue;
    }
    if (route.includes('/escalate/')) {
      score = xorGate(score, 0);
      continue;
    }
    if (route.includes('/close/')) {
      score = andGate(score, 0);
      continue;
    }
    if (route.includes('/commit/')) {
      score = orGate(score, 1);
      continue;
    }
    if (route.includes('/observe/')) {
      score = andGate(score, 1);
      continue;
    }
    if (route.includes('/buffer/')) {
      score = orGate(score, 0);
      continue;
    }
    score = 0;
  }
  return score;
};
