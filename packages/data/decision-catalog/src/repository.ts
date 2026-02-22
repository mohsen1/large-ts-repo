import type { DecisionPolicyTemplate } from './schema';

export interface PolicyRepository {
  getPolicy(templateId: string): Promise<DecisionPolicyTemplate | undefined>;
}

export interface InMemoryDecisionCatalog {
  [id: string]: DecisionPolicyTemplate;
}

export const buildInMemoryCatalog = (seed: InMemoryDecisionCatalog = {}): PolicyRepository => ({
  async getPolicy(templateId: string): Promise<DecisionPolicyTemplate | undefined> {
    return seed[templateId];
  },
});

export const loadPoliciesFromMap = async (
  repository: PolicyRepository,
  templateIds: readonly string[],
): Promise<Array<DecisionPolicyTemplate>> => {
  const out: DecisionPolicyTemplate[] = [];
  for (const id of templateIds) {
    const value = await repository.getPolicy(id);
    if (value) {
      out.push(value);
    }
  }
  return out;
};
