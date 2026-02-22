import type { DecisionStoreAdapter } from './store';
import { runDecision } from '@domain/decision-orchestration';

export interface EngineRunRequest {
  tenantId: string;
  subjectId: string;
  policyId: string;
  context: Record<string, unknown>;
}

export async function executeEngineRun(request: EngineRunRequest, store: DecisionStoreAdapter): Promise<string> {
  const result = await runDecision(request as unknown, {
    repository: store.repository,
    clock: { now: () => new Date().toISOString() },
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return `decision=${result.value.policy.id};actors=${result.value.selectedActors}`;
}
