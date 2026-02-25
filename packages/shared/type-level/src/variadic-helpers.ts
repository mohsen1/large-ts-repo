import { z } from 'zod';
import { type NoInfer } from './patterns';

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...FlattenTuple<Tail>]
  : readonly [];

export type ZipTupleArrays<
  A extends readonly unknown[],
  B extends readonly unknown[],
> = A extends readonly [infer AHead, ...infer ARest]
  ? B extends readonly [infer BHead, ...infer BRest]
    ? readonly [readonly [AHead, BHead], ...ZipTupleArrays<ARest, BRest>]
    : readonly []
  : readonly [];

type ExpandPathPrimitive = string | number | bigint;
type ExpandPathUnion<T> = T extends ExpandPathPrimitive ? `${T & ExpandPathPrimitive}` : never;

type ExpandObjectPath<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends ExpandPathPrimitive
        ? `${K}`
        : ExpandPathUnion<K> | `${K}.${Extract<ExpandPathUnion<T[K]>, string>}`;
    }[keyof T & string]
  : never;

export type ExpandPath<T> = T extends Date | Function
  ? never
  : T extends readonly [infer H, ...infer R]
    ? ExpandPathUnion<H> | `${Extract<ExpandPathUnion<H>, string>}.${Extract<ExpandPath<R>, string>}`
    : T extends readonly (infer U)[]
      ? `${number}` | `${number}.${Extract<ExpandPathUnion<U>, string>}`
      : ExpandObjectPath<T>;

export type MapEntries<T> = T extends readonly []
  ? []
  : T extends readonly [infer H, ...infer R]
    ? [
        H extends readonly [infer Head, infer Tail]
          ? readonly [Head, Tail]
          : H,
        ...MapEntries<R>,
      ]
    : readonly unknown[];

export type TuplePrefix<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? [readonly ['self', H], ...TuplePrefix<R>]
  : [];

export type ZipFlatten<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [
      Head extends readonly [infer A, infer B] ? readonly [A, B] : Head,
      ...ZipFlatten<Rest>,
    ]
  : readonly [];

export type CartesianProduct<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [infer AHead, ...infer ATail]
  ? B extends readonly [infer BHead, ...infer BTail]
    ? [
        readonly [AHead, BHead],
        ...CartesianProduct<ATail & readonly unknown[], BTail & readonly unknown[]>,
      ]
    : []
  : [];

export type ExpandTemplate<T extends string, Prefix extends string = ''> = T extends `${infer Head}-${infer Tail}`
  ? Prefix extends ''
    ? ExpandTemplate<Tail, Head>
    : `${Prefix}.${Head}` | ExpandTemplate<Tail, `${Prefix}.${Head}`>
  : Prefix;

export type RemapTemplate<TRecord extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof TRecord as K extends `${Prefix}-${infer Rest}` ? Rest : never]: TRecord[K];
};

export interface AsyncDisposableHandle {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export class OwnedDisposableStack {
  readonly #stack = new AsyncDisposableStack();
  readonly #acquired = new Set<AsyncDisposableHandle>();
  #disposed = false;

  constructor(readonly namespace: string) {}

  use<TResource extends AsyncDisposableHandle>(resource: TResource): TResource {
    if (this.#disposed) {
      throw new Error(`orchestrator stack is disposed: ${this.namespace}`);
    }
    this.#stack.use(resource);
    this.#acquired.add(resource);
    return resource;
  }

  async disposeAsync(reason?: string): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#acquired.clear();
    if (reason) {
      await this.#stack.disposeAsync();
      return;
    }
    await this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    (this.#stack as unknown as { dispose(): void }).dispose();
    this.#acquired.clear();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.disposeAsync();
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object';
};

export const asRecordTuple = <T extends ReadonlyArray<Record<string, unknown>>>(values: T): FlattenTuple<T> => {
  return values as unknown as FlattenTuple<T>;
};

export const tupleToMap = <T extends readonly unknown[]>(items: T): Map<number, unknown> => {
  const out = new Map<number, unknown>();
  for (const [index, value] of items.entries()) {
    out.set(index, value);
  }
  return out;
};

export const zipByIndex = <
  A extends readonly unknown[],
  B extends readonly unknown[],
>(left: NoInfer<A>, right: NoInfer<B>): ZipTupleArrays<A, B> => {
  const out: Array<readonly [unknown, unknown]> = [];
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    out.push([left[index], right[index]]);
  }
  return out as unknown as ZipTupleArrays<A, B>;
};

export const cartesianPairs = <
  A extends readonly unknown[],
  B extends readonly unknown[],
>(left: NoInfer<A>, right: NoInfer<B>): CartesianProduct<A, B> => {
  const out: Array<readonly [unknown, unknown]> = [];
  for (const first of left) {
    for (const second of right) {
      out.push([first, second]);
    }
  }
  return out as CartesianProduct<A, B>;
};

export const mapTupleRecursively = <T extends readonly unknown[], TResult>(
  tuple: NoInfer<T>,
  mapper: (item: T[number], index: number, total: number) => TResult,
): readonly TResult[] => {
  const out: TResult[] = [];
  const total = tuple.length;
  for (let index = 0; index < total; index++) {
    out.push(mapper(tuple[index], index, total));
  }
  return out;
};

export const tupleReduce = <T extends readonly unknown[], A>(
  tuple: NoInfer<T>,
  seed: A,
  reducer: (state: A, item: T[number], index: number, total: number) => A,
): A => {
  let state = seed;
  const total = tuple.length;
  for (let index = 0; index < total; index++) {
    state = reducer(state, tuple[index], index, total);
  }
  return state;
};

const maybeIterator =
  (globalThis as {
    readonly Iterator?: {
      from?: <T>(
        value: Iterable<T>,
      ) => { map<U>(transform: (value: T, index: number) => U): { toArray(): U[] } };
    };
  })
    .Iterator?.from;

export const mapWithIteratorHelpers = <T, R>(
  input: Iterable<T>,
  mapper: (value: T, index: number, total: number) => R,
): readonly R[] => {
  const values = Array.from(input) as readonly T[];
  if (maybeIterator?.(values.values())) {
    return maybeIterator(values.values())!
      .map((value: T, index: number) => mapper(value, index, values.length))
      .toArray();
  }
  return values.map((value, index) => mapper(value, index, values.length));
};

export const normalizeRecordToTuple = <
  const TRecord extends Record<string, unknown>,
  const TValue extends Record<string, unknown>,
>(record: TRecord, fallback: TValue): readonly [string, unknown][] => {
  const entries = Object.entries(record);
  return entries.length > 0 ? entries : Object.entries(fallback);
};

export const toTuple = <const T extends readonly unknown[]>(value: NoInfer<T>): T => {
  return value as unknown as T;
};

export const isStringTuple = (value: unknown): value is readonly string[] => {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
};

export const tupleSchema = z.array(z.unknown());

export const validateTuple = <const T extends readonly unknown[]>(
  value: unknown,
  expectedLength: number,
): value is T => {
  return tupleSchema.safeParse(value).success && isObject(value) && Array.isArray(value) && value.length === expectedLength;
};
