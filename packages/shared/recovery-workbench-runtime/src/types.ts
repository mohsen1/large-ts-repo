export type Brand<TValue, TMarker extends string> = TValue & {
  readonly __brand: TMarker;
};

export type Awaitable<TValue> = TValue | PromiseLike<TValue>;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Optional<TValue> = TValue | undefined;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type Result<TValue, TError = Error> =
  | { ok: true; value: TValue }
  | { ok: false; error: TError };

export type Expand<TValue> = TValue extends infer TAny
  ? { readonly [TKey in keyof TAny]: TAny[TKey] }
  : never;

export interface DisposableLike {
  [Symbol.dispose](): void;
}

export interface AsyncDisposableLike {
  [Symbol.asyncDispose](): PromiseLike<void>;
}

export interface WorkbenchScopeLike extends DisposableLike, AsyncDisposableLike {
  readonly label: string;
}

export interface SyncScopeAdapter {
  use<TResource extends { [Symbol.dispose]?: () => void }>(resource: TResource): TResource;
  adopt<TResource>(resource: TResource, onDispose: (resource: TResource) => void): TResource;
}

export interface AsyncScopeAdapter {
  use<TResource extends { [Symbol.asyncDispose]?: () => PromiseLike<void> }>(resource: TResource): TResource;
  adopt<TResource>(resource: TResource, onDispose: (resource: TResource) => PromiseLike<void>): TResource;
}

export interface DisposableStack extends DisposableLike, AsyncDisposableLike, SyncScopeAdapter, AsyncScopeAdapter {
  use<TResource extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
    resource: TResource,
  ): TResource;
  adopt<TResource>(resource: TResource, onDispose: (resource: TResource) => void | PromiseLike<void>): TResource;
  dispose(): void;
  disposeAsync(): PromiseLike<void>;
}

export type Merge<A, B> = Omit<A, keyof B> & B;

export type RecursiveTupleReverse<
  T extends readonly unknown[],
  TAccumulated extends readonly unknown[] = readonly [],
> = T extends readonly [infer THead, ...infer TTail extends readonly unknown[]]
  ? RecursiveTupleReverse<TTail, readonly [THead, ...TAccumulated]>
  : TAccumulated;

export type TupleMap<
  T extends readonly unknown[],
  TMapper extends ((item: unknown) => unknown),
> = {
  [K in keyof T]: T[K] extends Parameters<TMapper>[0] ? ReturnType<TMapper> : never;
};

export type TupleToUnion<T extends readonly unknown[]> = T extends readonly [infer THead, ...infer TTail]
  ? THead | TupleToUnion<TTail>
  : never;

export type PrefixTupleValues<TPrefix extends string, TTuple extends readonly string[]> = TTuple extends readonly [
  infer THead extends string,
  ...infer TTail extends readonly string[],
]
  ? readonly [`${TPrefix}:${THead}`, ...PrefixTupleValues<TPrefix, TTail>]
  : readonly [];

export type ExpandPath<T extends readonly string[]> = T extends readonly [
  infer THead extends string,
  ...infer TTail extends readonly string[],
]
  ? TTail extends readonly []
    ? THead
    : `${THead}.${ExpandPath<TTail>}`
  : never;

export type KeyByPrefix<
  TPayload extends Record<string, unknown>,
  TPrefix extends string,
> = {
  [TKey in keyof TPayload as TKey extends string ? `${TPrefix}:${TKey}` : never]: TPayload[TKey];
};

export type PluginResult<TDescriptor, TFallback = unknown> = TDescriptor extends {
  output: infer TOutput;
}
  ? { readonly output: TOutput }
  : { readonly output: TFallback };

export type PluginInput<TDescriptor> = TDescriptor extends { input: infer TInput } ? TInput : never;

export type PluginOutput<TDescriptor> = TDescriptor extends { output: infer TOutput } ? TOutput : never;

export type PluginRoute = `route:${string}`;

export type PluginChannel<TName extends string> = `${TName}:channel`;

export type TemplateValue<TContext extends string, TValue extends string> = `${TContext}::${TValue}`;

export interface PluginSignal {
  readonly type: PluginRoute;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestId: string;
  readonly stage: string;
  readonly confidence: number;
}

export type PluginTrace = {
  readonly stage: string;
  readonly actor: string;
  readonly score: number;
};

export const ok = <TValue>(value: TValue): Result<TValue> => ({ ok: true, value });

export const fail = <TError>(error: TError): Result<never, TError> => ({ ok: false, error });

export const asBrand = <TValue, TMarker extends string>(value: TValue): Brand<TValue, TMarker> =>
  value as Brand<TValue, TMarker>;

type AsyncScopeConstructor = typeof globalThis.AsyncDisposableStack;

const createFallbackScope = (): DisposableStack =>
  new (class {
    readonly #disposers: Array<() => void | PromiseLike<void>> = [];

    use<TResource extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
      resource: TResource,
    ): TResource {
      const disposer = resource[Symbol.dispose];
      if (typeof disposer === 'function') {
        this.adopt(resource, disposer);
      } else if (typeof resource[Symbol.asyncDispose] === 'function') {
        this.adopt(resource, async () => await resource[Symbol.asyncDispose]!());
      }

      return resource;
    }

    adopt<TResource>(resource: TResource, onDispose: (resource: TResource) => void | PromiseLike<void>): TResource {
      this.#disposers.push(() => onDispose(resource));
      return resource;
    }

    [Symbol.dispose](): void {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        const result = this.#disposers[index]();
        if (typeof result === 'object' && result !== null && 'then' in result && typeof result.then === 'function') {
          continue;
        }
      }
      this.#disposers.length = 0;
    }

    dispose(): void {
      this[Symbol.dispose]();
    }

    async [Symbol.asyncDispose](): Promise<void> {
      await this.disposeAsync();
    }

    disposeAsync(): PromiseLike<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        const result = this.#disposers[index]();
        if (result instanceof Promise) {
          return result.then(() => this[Symbol.dispose]());
        }
      }

      this.#disposers.length = 0;
      return Promise.resolve();
    }
  })();

export const createAsyncScope = (): DisposableStack => {
  const nativeScope = (globalThis.AsyncDisposableStack as
    | (new () => {
        use<TResource extends { [Symbol.asyncDispose]?: () => PromiseLike<void> }>(resource: TResource): TResource;
        adopt<TResource>(resource: TResource, onDispose: (resource: TResource) => void | PromiseLike<void>): void;
        [Symbol.asyncDispose](): PromiseLike<void>;
        [Symbol.dispose]?(): void;
      })
    | undefined);

  if (nativeScope && typeof globalThis.AsyncDisposableStack === 'function') {
    const nativeStack = new nativeScope();

    return {
      use: <TResource extends { [Symbol.dispose]?: () => void; [Symbol.asyncDispose]?: () => PromiseLike<void> }>(
        resource: TResource,
      ): TResource => {
        const syncDispose = resource[Symbol.dispose];
        if (typeof syncDispose === 'function') {
          nativeStack.adopt(resource, syncDispose.bind(resource));
        } else if (typeof resource[Symbol.asyncDispose] === 'function') {
          nativeStack.adopt(resource, () => resource[Symbol.asyncDispose]!());
        }
        return resource;
      },
      adopt: <TResource>(resource: TResource, onDispose: (resource: TResource) => void | PromiseLike<void>): TResource => {
        nativeStack.adopt(resource, () => onDispose(resource));
        return resource;
      },
      dispose(): void {
        if (typeof nativeStack[Symbol.dispose] === 'function') {
          nativeStack[Symbol.dispose]!();
        }
      },
      [Symbol.dispose](): void {
        this.dispose();
      },
      disposeAsync(): PromiseLike<void> {
        return Promise.resolve(nativeStack[Symbol.asyncDispose]()).then(() => {
          this[Symbol.dispose]();
        });
      },
      async [Symbol.asyncDispose](): Promise<void> {
        await this.disposeAsync();
      },
    };
  }

  return createFallbackScope();
};
