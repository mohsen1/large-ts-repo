import type { NoInfer } from '@shared/type-level';

export type ScopeEvent<TName extends string = string> = {
  readonly name: TName;
  readonly at: string;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
};

export interface ScopeStats {
  readonly created: number;
  readonly active: number;
  readonly closed: boolean;
  readonly label: string;
}

export interface ScopedHandle {
  readonly name: string;
  readonly open: () => void;
  readonly close: () => Promise<void>;
}

export interface AsyncScopeLease extends AsyncDisposable {
  readonly scope: string;
  readonly closed: boolean;
  readonly signal: <T>(value: T) => void;
  readonly summary: ScopeStats;
}

export interface SubscriptionScope extends AsyncDisposable {
  readonly scope: string;
  readonly events: ReadonlyArray<ScopeEvent>;
  readonly close: () => Promise<void>;
  readonly signal: (name: string, payload: Readonly<Record<string, string | number | boolean>>) => void;
}

export interface SubscriptionStats {
  readonly name: string;
  readonly value: number;
}

interface ManagedScope {
  readonly stack: AsyncDisposableStack;
  readonly events: ScopeEvent[];
  readonly label: string;
  closed: boolean;
}

const emitSignal = (name: string, payload: Record<string, string | number | boolean>): ScopeEvent =>
  ({
    name,
    at: new Date().toISOString(),
    payload: { ...payload, type: name },
  });

const createHandle = (name: string, scope: ManagedScope): ScopedHandle => ({
  name,
  open: () => {
    scope.events.push(emitSignal('open', { scope: name }));
  },
  close: async () => {
    scope.events.push(emitSignal('close', { scope: name }));
    return Promise.resolve();
  },
});

export const openScope = async (label: string): Promise<SubscriptionScope> => {
  const scope: ManagedScope = {
    stack: new AsyncDisposableStack(),
    events: [],
    label,
    closed: false,
  };
  const dispose = async () => {
    if (scope.closed) {
      return;
    }
    scope.closed = true;
    scope.events.push(emitSignal('dispose', { scope: label, mode: 'close' }));
    await scope.stack.disposeAsync();
  };

  const signal = (name: string, payload: Readonly<Record<string, string | number | boolean>>): void => {
    scope.events.push(emitSignal(name, { ...payload, scope: label }));
  };

  const proxy: SubscriptionScope = {
    scope: label,
    events: scope.events,
    signal: (name, payload) => {
      signal(name, payload);
    },
    close: async () => {
      await dispose();
      return;
    },
    async [Symbol.asyncDispose](): Promise<void> {
      await dispose();
    },
  };
  scope.stack.defer(() => proxy[Symbol.asyncDispose]());
  return proxy;
};

export const createAsyncScope = async (label: string): Promise<SubscriptionScope> => openScope(label);

export const createScopeEvents = async (
  labels: readonly string[],
): Promise<readonly ScopeEvent[]> => labels.map((label) => emitSignal('label', { label }));

export const registerScopeLease = <TScope extends string>(
  scope: SubscriptionScope,
  key: TScope,
): AsyncScopeLease => {
  const records: ScopeEvent[] = [];
  const emit = (name: string, value: ScopeEvent['payload'] = {}) => {
    const signal = emitSignal(name, { ...value, lease: key });
    records.push(signal);
  };
  const payload = {
    scope: key,
    closed: false,
    signal: <T>(value: T) => {
      emit('signal', { value: String(value) });
    },
    get summary(): ScopeStats {
      return {
        created: records.length,
        active: Math.max(0, records.filter((entry) => entry.name === 'signal').length),
        closed: false,
        label: String(key),
      };
    },
    async [Symbol.asyncDispose](): Promise<void> {
      if (payload.closed) {
        return;
      }
      payload.closed = true;
      emit('lease-dispose', { lease: String(key) });
    },
  };
  records.push(emitSignal('open', { lease: String(key) }));
  return payload;
};

export const emitScopeSignal = <TValue extends string>(
  scope: SubscriptionScope,
  name: NoInfer<TValue>,
): void => {
  scope.signal(name, { event: Date.now() });
};

export const isScopeClosed = (scope: { closed: boolean }): boolean => scope.closed;

export const withScopeAsync = async <TValue extends object, TResult>(
  name: NoInfer<TValue> extends string ? string : string,
  callback: (scope: SubscriptionScope) => Promise<TResult> | TResult,
): Promise<TResult> => {
  await using open = await openScope(String(name));
  return callback(open);
};

export const createScopeLease = (label: string): ScopedHandle => {
  const pending = {
    close: () => Promise.resolve(),
  };
  return {
    name: label,
    open: () => {
      pending.close = () => Promise.resolve();
    },
    close: async () => {
      await pending.close();
    },
  };
};

export const createScopeEventsSnapshot = (scope: SubscriptionScope): Readonly<Record<string, number>> =>
  scope.events.reduce((acc, event) => {
    const next = { ...acc };
    next[event.name] = (next[event.name] ?? 0) + 1;
    return next;
  }, {} as Record<string, number>);

export const disposeScope = async (scope: AsyncScopeLease): Promise<void> => {
  await scope[Symbol.asyncDispose]();
};

export const useScopeLease = async <TValue>(
  label: string,
  callback: (lease: AsyncScopeLease) => Promise<TValue>,
): Promise<TValue> => {
  const lease = registerScopeLease(await createAsyncScope('runtime-leases'), label);
  try {
    return await callback(lease);
  } finally {
    await lease[Symbol.asyncDispose]();
  }
};
