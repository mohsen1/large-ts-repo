export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest]
  ? Rest
  : [];

export type Prepend<T, U extends readonly unknown[]> = [T, ...U];

export type Concat<T extends readonly unknown[], U extends readonly unknown[]> = [...T, ...U];

export type Reverse<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? [...Reverse<R>, H]
  : [];

export type Take<
  T extends readonly unknown[],
  N extends number,
  Result extends readonly unknown[] = [],
> = T extends readonly [infer Head, ...infer Rest]
  ? Result['length'] extends N
    ? Result
    : Take<Rest, N, [...Result, Head]>
  : Result;

export type Drop<
  T extends readonly unknown[],
  N extends number,
  Seen extends readonly unknown[] = [],
> = T extends readonly [unknown, ...infer Rest]
  ? Seen['length'] extends N
    ? T
    : Drop<Rest, N, [...Seen, 0]>
  : [];

export type ZipTuple<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [
  infer AHead,
  ...infer ATail,
]
  ? B extends readonly [infer BHead, ...infer BTail]
    ? [[AHead, BHead], ...ZipTuple<ATail, BTail>]
    : []
  : [];

export type Chunk<T extends readonly unknown[], N extends number, Acc extends readonly unknown[] = []> = T extends readonly []
  ? Acc extends readonly []
    ? []
    : [Acc]
  : T extends readonly [infer Head, ...infer Tail]
    ? Acc['length'] extends N
      ? [Acc, ...Chunk<Tail, N, [Head]>]
      : Tail extends readonly []
        ? [Prepend<Head, Acc>]
        : Chunk<Tail, N, [...Acc, Head]>
    : [Acc];

export const tuple = <const T extends readonly unknown[]>(...values: T): T => values;

export const head = <T extends readonly unknown[]>(values: T): Head<T> => values[0] as Head<T>;

export const tail = <T extends readonly unknown[]>(values: T): Tail<T> =>
  values.slice(1) as Tail<T>;

export const reverse = <T extends readonly unknown[]>(values: T): Reverse<T> => {
  const output = [...values].slice().reverse();
  return output as Reverse<T>;
};

export const zipTuple = <A extends readonly unknown[], B extends readonly unknown[]>(
  left: A,
  right: B,
): ZipTuple<A, B> => {
  const output: Array<[unknown, unknown]> = [];
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    output.push([left[i], right[i]]);
  }
  return output as ZipTuple<A, B>;
};

export const concat = <A extends readonly unknown[], B extends readonly unknown[]>(left: A, right: B): Concat<A, B> =>
  [...left, ...right] as Concat<A, B>;

export const chunk = <T extends readonly unknown[], N extends number>(values: T, chunkSize: N): Chunk<T, N> => {
  const safeChunkSize = Math.max(1, chunkSize);
  const output: unknown[][] = [];
  for (let index = 0; index < values.length; index += safeChunkSize) {
    output.push(values.slice(index, index + safeChunkSize) as unknown[]);
  }
  return output as Chunk<T, N>;
};

export const splitByPrefix = <T extends readonly string[]>(values: T, prefix: string): [T, T] => {
  const withPrefix: string[] = [];
  const withoutPrefix: string[] = [];
  for (const value of values) {
    if (value.startsWith(prefix)) {
      withPrefix.push(value);
      continue;
    }
    withoutPrefix.push(value);
  }
  return [withPrefix as unknown as T, withoutPrefix as unknown as T];
};
