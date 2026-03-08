import { 'scope:enter' as scopeEnter, 'scope:exit' as scopeExit } from './module-tokens';

export type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
};

export type ScopeEventPhase = 'enter' | 'exit';

export type ScopeEvent = {
  readonly label: string;
  readonly phase: ScopeEventPhase;
  readonly at: number;
};

export type ScopeResult<T> = {
  readonly value: T;
  readonly timeline: readonly ScopeEvent[];
};

class ScopePhaseCatalog {
  static phases: readonly ScopeEventPhase[];
  static #phaseSet = new Set<ScopeEventPhase>();

  static {
    this.phases = [scopeEnter, scopeExit];
    this.#phaseSet = new Set(this.phases);
  }

  static isPhase(value: string): value is ScopeEventPhase {
    return this.#phaseSet.has(value as ScopeEventPhase);
  }
}

const now = (): number => Date.now();

const createScopeEvent = (label: string, phase: string): ScopeEvent => {
  if (!ScopePhaseCatalog.isPhase(phase)) {
    throw new Error(`Unknown scope phase: ${phase}`);
  }
  return { label, phase, at: now() };
};

class SyncScope implements Disposable {
  constructor(
    private readonly label: string,
    private readonly timeline: ScopeEvent[],
  ) {
    this.timeline.push(createScopeEvent(label, ScopePhaseCatalog.phases[0]));
  }

  [Symbol.dispose](): void {
    this.timeline.push(createScopeEvent(this.label, ScopePhaseCatalog.phases[1]));
  }
}

class AsyncScope implements AsyncDisposable {
  constructor(
    private readonly label: string,
    private readonly timeline: ScopeEvent[],
  ) {
    this.timeline.push(createScopeEvent(label, ScopePhaseCatalog.phases[0]));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.timeline.push(createScopeEvent(this.label, ScopePhaseCatalog.phases[1]));
  }
}

export const createDeferred = <T>(): Deferred<T> => Promise.withResolvers<T>();

export const collectUsing = <T, R extends Disposable & { readonly value: T }>(resources: Iterable<R>): readonly T[] => {
  const values: T[] = [];
  for (using resource of resources) {
    values.push(resource.value);
  }
  return values;
};

export const withScope = <T>(label: string, work: (timeline: readonly ScopeEvent[]) => T): ScopeResult<T> => {
  const timeline: ScopeEvent[] = [];
  let value!: T;
  {
    using scope = new SyncScope(label, timeline);
    value = work(timeline);
  }
  return { value, timeline };
};

export const withAsyncScope = async <T>(
  label: string,
  work: (timeline: readonly ScopeEvent[]) => Promise<T>,
): Promise<ScopeResult<T>> => {
  const timeline: ScopeEvent[] = [];
  let value!: T;
  {
    await using scope = new AsyncScope(label, timeline);
    value = await work(timeline);
  }
  return { value, timeline };
};

export const createCleanupStack = (register?: (stack: DisposableStack) => void): DisposableStack => {
  const stack = new DisposableStack();
  register?.(stack);
  return stack.move();
};

export const createAsyncCleanupStack = (register?: (stack: AsyncDisposableStack) => void): AsyncDisposableStack => {
  const stack = new AsyncDisposableStack();
  register?.(stack);
  return stack.move();
};

export const withAdoptedCleanup = <TResource, TResult>(
  resource: TResource,
  dispose: (resource: TResource) => void,
  work: (resource: TResource) => TResult,
): TResult => {
  let value!: TResult;
  {
    using stack = new DisposableStack();
    const adopted = stack.adopt(resource, dispose);
    value = work(adopted);
  }
  return value;
};

export const withAsyncAdoptedCleanup = async <TResource, TResult>(
  resource: TResource,
  dispose: (resource: TResource) => PromiseLike<void> | void,
  work: (resource: TResource) => Promise<TResult>,
): Promise<TResult> => {
  let value!: TResult;
  {
    await using stack = new AsyncDisposableStack();
    const adopted = stack.adopt(resource, dispose);
    value = await work(adopted);
  }
  return value;
};

export const withCleanup = <T>(work: (register: (callback: () => void) => void) => T): T => {
  let value!: T;
  {
    using cleanup = new DisposableStack();
    value = work((callback) => cleanup.defer(callback));
  }
  return value;
};

export const withAsyncCleanup = async <T>(
  work: (register: (callback: () => Promise<void> | void) => void) => Promise<T>,
): Promise<T> => {
  let value!: T;
  {
    await using cleanup = new AsyncDisposableStack();
    value = await work((callback) => cleanup.defer(callback));
  }
  return value;
};
