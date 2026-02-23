import { fail, ok, type Result } from '@shared/result';
import { InMemorySurfaceCommandStore, InMemorySurfaceCommandStore as Store } from './repository';

export interface StoreAdapter {
  readonly savePlan: (input: Parameters<Store['savePlan']>[0]) => Promise<Result<unknown>>;
  readonly getPlan: (planId: string) => Promise<Result<unknown>>;
  readonly listPlans: (tenant: string, limit?: number) => Promise<Result<unknown>>;
}

export interface StoreAdapterConfig {
  readonly namespace: string;
}

export const createInMemorySurfaceAdapter = (store: Store): StoreAdapter => ({
  savePlan: async (input) => {
    const saved = await store.savePlan(input);
    return saved;
  },
  getPlan: async (planId) => {
    const result = await store.findPlan(planId);
    if (result.ok) {
      return ok(result.value);
    }
    return fail(result.error);
  },
  listPlans: async (tenant, limit) => {
    const result = await store.listPlans(tenant, limit);
    return result;
  },
});

export const makeStoreAdapter = (config: StoreAdapterConfig): StoreAdapter => {
  const namespace = config.namespace.trim().toLowerCase();
  const store = new InMemorySurfaceCommandStore();
  return createInMemorySurfaceAdapter(store);
};
