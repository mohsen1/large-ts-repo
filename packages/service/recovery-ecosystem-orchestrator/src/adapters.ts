import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { OrchestratorPort } from './ports';
import { asRunId, type RunId } from '@domain/recovery-ecosystem-core';

type AdapterConfig = {
  readonly namespace: string;
  readonly timeoutMs: number;
  readonly retryLimit: 1 | 2 | 3;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const looksTransient = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return normalized.includes('timeout') || normalized.includes('retry') || normalized.includes('temporar');
};

export class NullAdapter implements OrchestratorPort {
  public async open(): Promise<Result<boolean>> {
    return ok(true);
  }
  public async close(): Promise<void> {}
  public async signal(): Promise<void> {}
}

export class DurableAdapter implements OrchestratorPort {
  readonly #config: AdapterConfig;
  readonly #active = new Set<string>();

  public constructor(config: AdapterConfig) {
    this.#config = config;
  }

  public get config(): AdapterConfig {
    return this.#config;
  }

  public async open(runId: RunId): Promise<Result<boolean>> {
    await delay(this.#config.timeoutMs);
    this.#active.add(runId);
    return ok(true);
  }

  public async close(runId: RunId): Promise<void> {
    this.#active.delete(runId);
  }

  public async signal(runId: RunId, event: string, details: Record<string, unknown>): Promise<void> {
    if (!this.#active.has(runId) && looksTransient(event)) {
      return;
    }
    if (Object.keys(details).length === 0) {
      return;
    }
  }

  public async withRetry<T>(operation: () => Promise<T>, attempts = 1): Promise<T> {
    let remaining = attempts;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        remaining -= 1;
        if (remaining <= 0 || !looksTransient(String(error))) {
          throw error;
        }
      }
    }
  }
}

export class AuditAdapter implements OrchestratorPort {
  readonly #inner: DurableAdapter;

  public constructor(config: AdapterConfig) {
    this.#inner = new DurableAdapter(config);
  }

  public async open(runId: RunId): Promise<Result<boolean>> {
    return this.#inner.open(runId);
  }

  public async close(runId: RunId): Promise<void> {
    await this.#inner.close(runId);
  }

  public async signal(runId: RunId, event: string, details: Record<string, unknown>): Promise<void> {
    await this.#inner.signal(runId, event, details);
  }
}

export const createAdapter = (namespace: string, timeoutMs = 20): DurableAdapter =>
  new DurableAdapter({ namespace, timeoutMs, retryLimit: 2 });

export const ensureRunId = (value: string): RunId => asRunId(value);
export const asSignal = (value: string): `event:${string}` => `event:${value}` as `event:${string}`;
export const toAuditMessage = (runId: RunId, event: string, details: Record<string, unknown>): string =>
  JSON.stringify({ runId, event, details });

export { type AdapterConfig };
