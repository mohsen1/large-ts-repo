import type { CommandIntent, CommandDirective, PriorityBand } from '@domain/recovery-command-language';

export interface CandidatePolicy {
  name: string;
  weight: number;
  allowExecution: boolean;
}

export interface DecisionContext {
  intent: CommandIntent;
  directives: CommandDirective[];
  policies: CandidatePolicy[];
}

export interface DecisionResult {
  accepted: boolean;
  reasons: string[];
  priority: PriorityBand;
}

export function inspectPolicies(context: DecisionContext): DecisionResult {
  const reasonSet = new Set<string>();
  let accepted = true;
  let maxWeight = 0;

  for (const policy of context.policies) {
    maxWeight += policy.weight;
    if (!policy.allowExecution) {
      accepted = false;
      reasonSet.add(`policy blocked: ${policy.name}`);
    }
  }

  const priority: DecisionResult['priority'] = maxWeight > 3
    ? 'critical'
    : maxWeight > 2
      ? 'high'
      : maxWeight > 1
        ? 'normal'
        : 'low';

  return {
    accepted,
    reasons: Array.from(reasonSet),
    priority,
  };
}

export function applyPolicyOverrides(result: DecisionResult, reason: string): DecisionResult {
  return {
    ...result,
    accepted: reason === '' ? result.accepted : false,
    reasons: [...result.reasons, reason].filter((item) => item.length > 0),
  };
}
