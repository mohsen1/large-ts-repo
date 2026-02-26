type Boolify<T> = T extends 0 | '' | false | null | undefined ? false : true;

type Not<T extends boolean> = T extends true ? false : true;

type AndChain<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Boolify<Head> extends true
    ? AndChain<Tail>
    : false
  : true;

type OrChain<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Boolify<Head> extends true
    ? true
    : OrChain<Tail>
  : false;

type XorChain<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly []
    ? Boolify<Head>
    : Boolify<Head> extends true
      ? Not<OrChain<Tail>>
      : OrChain<Tail>
  : false;

export type NumberTuple<N extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends N
  ? Acc
  : NumberTuple<N, [...Acc, unknown]>;

export type AddTwo<A extends number, B extends number> = number;

type Decrement<N extends number> = NumberTuple<N> extends readonly [infer _Head, ...infer Tail] ? Tail['length'] : never;

type MultiplyScalar<A extends number, B extends number> = B extends 0
  ? 0
  : B extends 1
    ? A
    : B extends 2
      ? AddTwo<A, A>
      : B extends 3
        ? AddTwo<A, AddTwo<A, A>>
        : B extends 4
          ? AddTwo<AddTwo<A, A>, AddTwo<A, A>>
          : number;

export type MultiplyTwo<A extends number, B extends number> = MultiplyScalar<A, B>;

export type ChainProduct<T extends readonly number[]> = T extends readonly [infer H extends number, ...infer R extends number[]]
  ? R extends []
    ? H
    : MultiplyTwo<H, ChainProduct<R>>
  : 1;

type ToBooleanTuple<T extends readonly unknown[]> = {
  [K in keyof T]: Boolify<T[K]>;
};

type MergeFlags<TA extends readonly unknown[], TB extends readonly unknown[]> = {
  readonly and: AndChain<TA>;
  readonly or: OrChain<TA>;
  readonly xor: XorChain<TA>;
  readonly andB: AndChain<TB>;
  readonly orB: OrChain<TB>;
  readonly xorB: XorChain<TB>;
};

export type MergeTupleState<T extends readonly unknown[]> = T extends readonly [infer A, infer B, ...infer C]
  ? {
      readonly head: A;
      readonly tailLength: T['length'];
      readonly chain: C['length'];
      readonly guard: MergeFlags<[Boolify<A>, ...ToBooleanTuple<C>], [Boolify<B>, ...ToBooleanTuple<C>]>;
    }
  : never;

export type StringTemplateChain<T extends string> = T extends `${infer A}_${infer B}_${infer C}_${infer D}`
  ? { readonly a: A; readonly b: B; readonly c: C; readonly d: D }
  : T extends `${infer A}-${infer B}-${infer C}`
    ? { readonly a: A; readonly b: B; readonly c: C; readonly d: '' }
    : never;

export type ParseEventCode<T extends string> = T extends `evt-${infer Domain}-${infer Action}-${infer Index}`
  ? {
      readonly domain: Domain;
      readonly action: Action;
      readonly index: Index;
    }
  : {
      readonly domain: string;
      readonly action: string;
      readonly index: string;
    };

export type BinaryExpression<T extends readonly unknown[]> = MergeTupleState<T>;

export const parseCode = <T extends string>(input: T): StringTemplateChain<T> => {
  const [_, action, index, token] = input.split('-') as [string, string, string, string];
  return {
    a: _.replace('evt', 'evt') as string,
    b: action ?? '',
    c: index ?? '',
    d: token ?? '',
  } as StringTemplateChain<T>;
};

export const buildTemplateChain = <T extends string>(input: T) => {
  const parsed = parseCode(input);
  const template = `${parsed.a}:${parsed.b}:${parsed.c}` as const;
  const path = `${template}/${parsed.d ?? '0'}` as const;
  return { source: input, parsed, path, template };
};

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'number') {
    return value > 0;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return value != null;
};

export const evaluateChain = (values: readonly unknown[]) => {
  const bools = values.map(coerceBoolean);
  const and = bools.reduce((acc, next) => acc && next, true);
  const or = bools.reduce((acc, next) => acc || next, false);
  const xor = bools.reduce((acc, next) => (acc ? !next : next), false);
  const numeric = bools.reduce((acc, next) => acc + (next ? 1 : 0), 0);
  const templates = values.map((value, index) => buildTemplateChain(`evt-${index + 1}-${index + 2}-${coerceBoolean(value)}` as const));
  return { and, or, xor, numeric, templates };
};

export const accumulate = <T extends readonly unknown[]>(source: T) => {
  const bools = source.map(coerceBoolean);
  return {
    a: bools.every(Boolean) as AndChain<T>,
    b: bools.some(Boolean) as OrChain<T>,
    c: (bools.filter(Boolean).length % 2 === 1) as unknown as XorChain<T>,
    products: {
      and: bools.every(Boolean),
      or: bools.some(Boolean),
      xor: bools.filter(Boolean).length % 2 === 1,
    },
  };
};

type ChainNode = (input: number) => (input: number) => (input: number) => { readonly value: number };

const andThen = (base: number): ChainNode =>
  (left) =>
    (middle) =>
      (right) =>
        ({ value: base + left + middle + right }) as const;

const orElse = (base: number): ChainNode =>
  (left) =>
    (middle) =>
      (right) =>
        ({ value: base - left - middle - right }) as const;

export const buildArithmeticChain = (values: readonly [number, number, number, number, number]) => {
  const [a, b, c, d, e] = values;
  const result = a + b * c - d + e;
  const chain = a > b ? andThen(a)(b)(c)(d).value : orElse(a)(b)(c)(d).value;
  const template = buildTemplateChain(`evt-arith-${a + b}-${result}` as const);
  return {
    result,
    chain,
    ratio: `${result}:${a * b + chain}` as const,
    template,
  };
};

export const buildTemplateCatalog = () => {
  const codes = [
    buildTemplateChain('evt-ops-drill-1'),
    buildTemplateChain('evt-fabric-route-2'),
    buildTemplateChain('evt-policy-notify-3'),
    buildTemplateChain('evt-incidents-rollback-4'),
    buildTemplateChain('evt-ops-recover-5'),
    buildTemplateChain('evt-ops-suppress-6'),
  ];
  const byDomain = codes.reduce<Record<string, number>>((acc, entry) => {
    const key = `${entry.parsed.a}:${entry.parsed.b}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const boolean = evaluateChain(codes.map((entry) => entry.path));
  return { codes, byDomain, boolean };
};

export const evaluateBinaryChain = <T extends readonly unknown[]>(input: T) =>
  accumulate(input);

export type BuildArithmeticChain = typeof buildArithmeticChain;
