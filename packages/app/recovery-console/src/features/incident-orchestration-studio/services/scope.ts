export interface DisposableScope {
  readonly defer: (handler: () => void | Promise<void>) => void;
}

export interface SyncScope {
  readonly defer: (handler: () => void) => void;
  [Symbol.dispose](): void;
}

export interface AsyncScope {
  readonly defer: (handler: () => void | Promise<void>) => void;
  [Symbol.asyncDispose](): Promise<void>;
}

export const createSyncScope = (): SyncScope => {
  const handlers: Array<() => void> = [];
  return {
    defer(handler) {
      handlers.push(handler);
    },
    [Symbol.dispose]() {
      for (let index = handlers.length - 1; index >= 0; index -= 1) {
        handlers[index]();
      }
    },
  };
};

export const createAsyncScope = (): AsyncScope => {
  const handlers: Array<() => void | Promise<void>> = [];
  return {
    defer(handler) {
      handlers.push(handler);
    },
    async [Symbol.asyncDispose]() {
      for (let index = handlers.length - 1; index >= 0; index -= 1) {
        await handlers[index]();
      }
    },
  };
};
