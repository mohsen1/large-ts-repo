import { hydratePolicyAndAct, validateIntent } from '@domain/decision-orchestration';
import { buildInMemoryRepository, type InMemoryStore } from './store';
import type { DecisionPolicyTemplate, PolicyRepository } from '@data/decision-catalog';
import { DecisionPolicy } from '@domain/decision-orchestration';

interface EngineDeps {
  policyId: string;
  repository: PolicyRepository;
  store: InMemoryStore;
}

class RuntimeEngine {
  constructor(private readonly policyId: string, private readonly repository: PolicyRepository) {}

  async run(): Promise<string> {
    const policy: DecisionPolicyTemplate = await this.repository.getById(this.policyId) as DecisionPolicyTemplate;
    const compiled = DecisionPolicy.compile(policy);
    const result = await compiled.execute({}, policy);
    return `${policy.id}:${result.actions.length}`;
  }
}

export function buildEngine(policyId: string, repository: PolicyRepository): RuntimeEngine {
  return new RuntimeEngine(policyId, repository);
}
