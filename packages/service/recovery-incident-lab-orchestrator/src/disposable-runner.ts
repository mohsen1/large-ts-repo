import { createClock } from '@domain/recovery-incident-lab-core';

export interface LabRunScopeState {
  readonly name: string;
  readonly startedAt: string;
  readonly disposedAt?: string;
}

export class LabRunScope {
  readonly #label: string;
  readonly #startedAt: string;
  #disposed = false;

  constructor(label: string) {
    this.#label = label;
    this.#startedAt = createClock().now();
  }

  getState(): LabRunScopeState {
    return {
      name: this.#label,
      startedAt: this.#startedAt,
      ...(this.#disposed ? { disposedAt: createClock().now() } : {}),
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    await Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
  }
}

export const withLabRunScope = async <T>(
  label: string,
  run: (scope: LabRunScope) => Promise<T>,
): Promise<T> => {
  await using scope = new LabRunScope(label);
  return run(scope);
};

export const composeTimeline = (inputs: readonly string[]): readonly LabRunScopeState[] => {
  const baseline = inputs
    .map((entry) => ({ name: entry, startedAt: createClock().now() }))
    .toSorted((left, right) => left.name.localeCompare(right.name));

  return baseline;
};

export const finalizeScope = async (scope: LabRunScope, extra: Readonly<Record<string, unknown>>): Promise<LabRunScopeState> => {
  void extra;
  await Promise.resolve().then(() => {
    void scope;
  });
  return scope.getState();
};

export const buildScopeReport = (scopes: readonly LabRunScopeState[]): {
  readonly count: number;
  readonly labels: readonly string[];
} => ({
  count: scopes.length,
  labels: scopes.map((scope) => scope.name).sort(),
});
