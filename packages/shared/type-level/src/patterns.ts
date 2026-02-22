export type Primitive = string | number | boolean | bigint | symbol | null | undefined;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface JsonArray extends Array<JsonValue> {}

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends Primitive
    ? T
    : T extends Array<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type Flatten<T> = T extends Array<infer U> ? U : T;
export type AwaitedLike<T> = T extends PromiseLike<infer U> ? AwaitedLike<U> : T;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type OmitNever<T> = {
  [K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsAny<T> = 0 extends 1 & T ? true : false;

export type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false;

export type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

export type Merge<A, B> = Omit<A, keyof B> & B;

export type DeepMerge<A, B> =
  A extends Primitive[]
    ? [...A, ...(B extends Primitive[] ? B : [])]
    : A extends Primitive
      ? B
      : B extends Primitive
        ? B
        : {
            [K in keyof (A & B)]: K extends keyof B
              ? K extends keyof A
                ? DeepMerge<A[K], B[K]>
                : B[K]
              : K extends keyof A
                ? A[K]
                : never;
          };

export type MergeMap<A extends Record<string, unknown>, K extends keyof A> =
  { [P in keyof A]: { key: P; value: A[P] } }[K];

export type KeyPaths<T> = T extends Date | Primitive
  ? never
  : T extends Array<infer U>
    ? KeyPaths<U> extends never ? `[]` : `[]` | `[${number}]${KeyPaths<U> extends never ? '' : `.${KeyPaths<U>}`}`
    : { [K in keyof T & string]: T[K] extends Primitive
        ? K
        : T[K] extends Array<infer U>
          ? `${K}[]` | `${K}[${number}]${KeyPaths<U> extends never ? '' : `.${KeyPaths<U>}`}`
          : `${K}` | `${K}.${KeyPaths<T[K]>}`
      }[keyof T & string];

export type PathValue<T, P extends string> =
  P extends `${infer H}.${infer R}`
    ? H extends keyof T
      ? PathValue<T[H], R>
      : unknown
    : P extends keyof T
      ? T[P]
      : unknown;

export type PathTuple<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? [K, ...PathTuple<T[K]>]
        : [K];
    }[keyof T & string]
  : [];

export type Predicate<T> = (value: T) => value is T;

export type Guard<T, S extends T = T> = (value: T) => value is S;

export interface Cursor<T> {
  readonly value: T;
  readonly atEnd: boolean;
  moveNext(): this;
}

export type NonEmptyArray<T> = [T, ...T[]];

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type TaskState = 'idle' | 'running' | 'complete' | 'errored' | 'cancelled';

export interface AsyncTask<I, O> {
  id: Brand<string, 'task-id'>;
  name: string;
  state: TaskState;
  input: I;
  output?: O;
}

export interface GraphNode<I, O> {
  id: Brand<string, 'graph-node'>;
  label: string;
  requires: NonEmptyArray<Brand<string, 'graph-node'>>;
  run(input: I): Promise<O>;
}

export class Pipeline<I, O> {
  private readonly steps: Array<(input: any) => Promise<any>>;

  constructor(private readonly name: string, steps: Array<(input: any) => Promise<any>>) {
    this.steps = steps;
  }

  async execute(input: I): Promise<O> {
    let current: any = input;
    for (const step of this.steps) {
      current = await step(current);
    }
    return current as O;
  }

  getName(): string {
    return this.name;
  }
}

export type AsyncMapper<I, O> = (input: I) => Promise<O>;

export interface Foldable<T> {
  reduce<A>(seed: A, fn: (acc: A, value: T) => A): A;
}

export type AsyncReducer<T, A> = (acc: A, value: T, index: number) => Promise<A>;

export async function runPipeline<I, O>(
  name: string,
  steps: readonly AsyncMapper<any, any>[],
  input: I,
): Promise<O> {
  const p = new Pipeline<I, O>(name, [...steps]);
  return p.execute(input);
}

export function isResult<T, E>(value: Result<T, E>): value is { ok: true; value: T } {
  return value.ok;
}

export function unwrapResult<T, E>(value: Result<T, E>, fallback: (error: E) => T): T {
  return value.ok ? value.value : fallback(value.error);
}
