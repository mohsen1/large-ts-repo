import type { Result } from '@shared/result';
import { ok } from '@shared/result';
import { seedStore, RecoveryHorizonStore } from './store.js';
import type {
  HorizonLookupConfig,
  HorizonMutationEvent,
  HorizonReadResult,
  HorizonWriteArgs,
  HorizonHistoryWindow,
} from './types.js';
import type { HorizonSignal, PluginStage, JsonLike, PlanId, TimeMs } from '@domain/recovery-horizon-engine';

const nowMs = (): TimeMs => Date.now() as TimeMs;
type HorizonSignalStream = AsyncGenerator<HorizonSignal<PluginStage, JsonLike>>;
type StreamSignalsResult = Result<HorizonSignalStream>;

type StoreCache = {
  readonly tenantId: string;
  readonly createdAt: TimeMs;
  readonly store: RecoveryHorizonStore;
};

export class RecoveryHorizonRepository {
  #stores = new Map<string, StoreCache>();

  constructor(
    initialTenants: readonly string[] = [],
  ) {
    for (const tenantId of initialTenants) {
      this.getOrCreateStore(tenantId);
    }
  }

  getOrCreateStore(tenantId: string): RecoveryHorizonStore {
    const existing = this.#stores.get(tenantId);
    if (existing) {
      return existing.store;
    }

    const newStore = seedStore();
    this.#stores.set(tenantId, {
      tenantId,
      createdAt: nowMs(),
      store: newStore,
    });
    return newStore;
  }

  async write(input: HorizonSignal<PluginStage, JsonLike>): Promise<Result<void>> {
    const tenantId = input.input.tenantId;
    const store = this.getOrCreateStore(tenantId);
    const result = store.upsert(input);
    if (!result.ok) {
      return result;
    }
    return ok(undefined);
  }

  async writeMany(inputs: readonly HorizonSignal<PluginStage, JsonLike>[]): Promise<Result<number>> {
    const writes = inputs.map((input) => this.getOrCreateStore(input.input.tenantId).upsert(input));
    const success = writes.filter((entry) => entry.ok).length;
    return Promise.resolve(ok(success));
  }

  read(config: HorizonLookupConfig): Promise<Result<HorizonReadResult>> {
    return this.getOrCreateStore(config.tenantId).list(config) as Promise<Result<HorizonReadResult>>;
  }

  async streamSignals(
    config: HorizonLookupConfig,
  ): Promise<StreamSignalsResult> {
    const iterator = this.getOrCreateStore(config.tenantId).stream(config);
    return Promise.resolve({ ok: true, value: iterator });
  }

  async history(config: HorizonLookupConfig): Promise<Result<HorizonHistoryWindow>> {
    return this.getOrCreateStore(config.tenantId).history(config) as Promise<Result<HorizonHistoryWindow>>;
  }

  async applyBatch(config: HorizonLookupConfig, args: HorizonWriteArgs[]): Promise<Result<HorizonMutationEvent[]>> {
    const store = this.getOrCreateStore(config.tenantId);
    const wrote = (await store.applyBulk(args)) as unknown as Result<number>;
    if (!wrote.ok) {
      return { ok: false, error: wrote.error };
    }
    const nextEvents = Array.from({ length: wrote.value }).map<HorizonMutationEvent>((_, index) => ({
      kind: 'upsert',
      tenantId: config.tenantId,
      planId: `batch-${index}` as PlanId,
      runId: (`batch-run-${index}` as unknown) as never,
      at: nowMs(),
    }));
    return ok(nextEvents);
  }
}

export const createRepository = (
  ...initialTenants: readonly string[]
): RecoveryHorizonRepository => {
  return new RecoveryHorizonRepository(initialTenants);
};

export const writeSignals = async (
  repository: RecoveryHorizonRepository,
  tenantId: string,
  signals: readonly HorizonSignal<PluginStage, JsonLike>[],
) => {
  const scoped = signals.map((signal) => ({
    ...signal,
    input: {
      ...signal.input,
      tenantId,
    },
  }));
  return repository.writeMany(scoped);
};
