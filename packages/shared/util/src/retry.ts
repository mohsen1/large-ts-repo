export interface RetryOptions {
  times: number;
  delayMs: number;
  factor?: number;
}

export const wait = (ms: number, signal?: AbortSignal): Promise<void> => {
  const deferred = Promise.withResolvers<void>();
  const onAbort = () => {
    clearTimeout(timer);
    deferred.reject(signal?.reason ?? new Error('Retry wait aborted'));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    deferred.resolve();
  }, ms);

  signal?.addEventListener('abort', onAbort, { once: true });
  return deferred.promise.finally(() => signal?.removeEventListener('abort', onAbort));
};

export const withRetry = async <T>(
  action: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  let attempt = 0;
  let last: unknown;
  let delay = options.delayMs;
  while (attempt < options.times) {
    try {
      return await action();
    } catch (error) {
      last = error;
      attempt += 1;
      if (attempt >= options.times) break;
      await wait(delay);
      delay = Math.ceil((options.factor ?? 2) * delay);
    }
  }
  throw last;
};

export const neverFail = async <T>(action: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await action();
  } catch {
    return fallback;
  }
};
