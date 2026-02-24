export interface DisposableLike {
  [Symbol.dispose]?(): void;
}

export interface AsyncDisposableLike {
  [Symbol.asyncDispose]?(): Promise<void> | void;
}

export type AnyDisposable = (DisposableLike & AsyncDisposableLike) | DisposableLike | AsyncDisposableLike | object;

function isAsyncDisposalToken(value: unknown): value is { [Symbol.asyncDispose](): Promise<void> | void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncDispose]?: unknown })[Symbol.asyncDispose] === 'function'
  );
}

function isDisposalToken(value: unknown): value is { [Symbol.dispose](): void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.dispose]?: unknown })[Symbol.dispose] === 'function'
  );
}

export class TimelineDisposableScope implements Disposable {
  readonly #disposers = new Set<() => Promise<void> | void>();
  readonly #tag: string;
  #closed = false;

  constructor(tag: string) {
    this.#tag = tag;
  }

  adopt<T extends AnyDisposable>(resource: T): T {
    if (this.#closed) {
      throw new Error(`cannot register resource, scope ${this.#tag} is closed`);
    }

    if (isAsyncDisposalToken(resource)) {
      this.#disposers.add(() => resource[Symbol.asyncDispose]?.());
    } else if (isDisposalToken(resource)) {
      this.#disposers.add(() => resource[Symbol.dispose]?.());
    }
    return resource;
  }

  use<T>(resource: T): T {
    this.adopt(resource as AnyDisposable);
    return resource;
  }

  get size(): number {
    return this.#disposers.size;
  }

  async disposeAsync(): Promise<void> {
    await this[Symbol.asyncDispose]();
  }

  [Symbol.dispose](): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;

    for (const disposer of this.#disposers) {
      disposer();
    }

    this.#disposers.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;

    const disposers = [...this.#disposers];
    this.#disposers.clear();

    for (const disposer of disposers) {
      const maybePromise = disposer();
      if (maybePromise) {
        await maybePromise;
      }
    }
  }
}

export class AsyncTimelineScope implements AsyncDisposable {
  readonly #stack = new AsyncDisposableStack();

  constructor() {}

  adopt<T>(resource: T): T {
    if (typeof resource === 'object' && resource !== null) {
      const anyResource = resource as AnyDisposable;

      if (isAsyncDisposalToken(anyResource)) {
        this.#stack.defer(() => Promise.resolve(anyResource[Symbol.asyncDispose]?.()));
      } else if (isDisposalToken(anyResource)) {
        this.#stack.defer(() => anyResource[Symbol.dispose]?.());
      }
    }
    return resource;
  }

  [Symbol.asyncDispose](): PromiseLike<void> {
    return this.#stack[Symbol.asyncDispose]();
  }
}

export async function withTimelineScope<T>(
  name: string,
  fn: (scope: TimelineDisposableScope) => T,
): Promise<T> {
  await using scope = new TimelineDisposableScope(name);
  return fn(scope);
}

export async function withAsyncTimelineScope<T>(
  fn: (scope: AsyncTimelineScope) => Promise<T>,
): Promise<T> {
  await using scope = new AsyncTimelineScope();
  return fn(scope);
}
