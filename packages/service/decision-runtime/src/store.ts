import { type PolicyRepository, buildInMemoryCatalog } from '@data/decision-catalog';

export type DecisionCatalogStore = ReturnType<typeof buildInMemoryCatalog>;

export function buildRuntimeCatalog(seed?: Record<string, unknown>): DecisionCatalogStore {
  return buildInMemoryCatalog(seed as Record<string, any>);
}

export interface DecisionStoreAdapter extends PolicyRepository {
  repository: PolicyRepository;
  upsert(templateId: string, payload: Record<string, unknown>): void;
}

export class InMemoryDecisionStore implements DecisionStoreAdapter {
  constructor(public readonly repository: DecisionCatalogStore = buildInMemoryCatalog() as DecisionCatalogStore) {}

  getPolicy(templateId: string) {
    return this.repository.getPolicy(templateId);
  }

  upsert(templateId: string, payload: Record<string, unknown>): void {
    const catalog = this.repository as Record<string, any>;
    catalog[templateId] = payload;
  }
}
