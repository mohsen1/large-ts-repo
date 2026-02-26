export interface RuntimeHandle {
  readonly id: string;
  readonly createdAt: number;
  readonly tags: readonly string[];
  [Symbol.dispose](): void;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export type GuardedResult<T> = {
  readonly ok: true;
  readonly value: T;
} | {
  readonly ok: false;
  readonly error: Error;
};

export const createRuntimeHandle = (id: string, tags: readonly string[]): RuntimeHandle => {
  const handle: RuntimeHandle = {
    id,
    createdAt: Date.now(),
    tags,
    [Symbol.dispose]() {
      return;
    },
  };
  return handle;
};

export const createAsyncHandle = async (id: string, tags: readonly string[]): Promise<RuntimeHandle> => {
  const handle: RuntimeHandle = {
    id,
    createdAt: Date.now(),
    tags,
    [Symbol.dispose]() {
      return;
    },
    async [Symbol.asyncDispose]() {
      await Promise.resolve();
    },
  };
  return handle;
};

export const withRuntimeScope = async <T>(
  id: string,
  tags: readonly string[],
  run: (scope: RuntimeHandle) => Promise<T>,
): Promise<GuardedResult<T>> => {
  await using local = new AsyncDisposableStack();
  await using metrics = await createAsyncHandle(`${id}:metrics`, tags);
  await using trace = await createAsyncHandle(`${id}:trace`, ['trace', ...tags]);
  local.defer(() => {
    // no-op disposer registered for symmetry with explicit dispose path
  });
  const scope = createRuntimeHandle(id, tags);
  local.adopt(scope, () => {
    return;
  });

  try {
    return { ok: true, value: await run(scope) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  } finally {
    await local.disposeAsync();
  }
};

export const iteratorReduce = (values: Iterable<number>): number => {
  return [...values]
    .map((value) => value * 2)
    .reduce((acc, current) => acc + current, 0);
};

export type TokenPair<A extends string, B extends string> = `${A}:${B}`;

export type TokenLedger = {
  readonly pair: TokenPair<'route' | 'control', 'on' | 'off'>;
  readonly valid: boolean;
};

export const buildTokenLedger = (tokens: readonly string[]): TokenLedger[] => {
  const withMode = tokens
    .filter((entry) => entry.length > 0)
    .flatMap((entry, index) => {
      const pair = `${entry}:${index % 2 === 0 ? 'on' : 'off'}` as TokenPair<'route', 'on' | 'off'>;
      return [{ pair, valid: entry !== '' }];
    });

  const sorted = withMode.toSorted((left, right) => left.pair.localeCompare(right.pair));
  return sorted;
};

export const assertGuarded = (result: GuardedResult<number>): number => {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
};

export const runGuardedBudget = async (seed: number) => {
  return withRuntimeScope('guarded-runtime', ['stress', 'runtime'], async (scope) => {
    const values = Array.from({ length: seed }, (_, index) => index);
    const total = iteratorReduce(values);
    const ledger = buildTokenLedger(['router', 'scheduler', 'planner', 'controller']);
    return {
      scope,
      total,
      ledger,
      average: total / Math.max(1, seed),
    };
  });
};
