import { FulfillmentStrategy, FulfillmentPolicy, defaultPolicy, validatePolicy } from '@domain/fulfillment-orchestration';

export interface StrategyDecisionInput {
  weight: number;
  fragile: boolean;
  valueUsd: number;
  requested: FulfillmentStrategy;
}

export interface StrategyDecision {
  selected: FulfillmentStrategy;
  policy: FulfillmentPolicy;
  notes: string[];
}

export const selectStrategy = (input: StrategyDecisionInput): StrategyDecision => {
  const policy = validatePolicy(defaultPolicy);
  const notes: string[] = [];
  if (policy.length) {
    throw new Error('policy invalid');
  }

  let selected: FulfillmentStrategy = input.requested;
  if (input.fragile && input.valueUsd > 1000) {
    selected = 'cold-chain';
    notes.push('fragile+value => cold-chain');
  } else if (input.valueUsd > 6000) {
    selected = 'international';
    notes.push('high value => international');
  } else if (input.weight < 0.5 && input.requested !== 'express' && input.valueUsd < 200) {
    selected = 'standard';
    notes.push('small order => standard');
  }

  return { selected, policy: validateOrThrow(), notes };
};

const validateOrThrow = (): FulfillmentPolicy => {
  const normalized = defaultPolicy;
  if (normalized.maxConcurrentRuns <= 0) {
    throw new Error('invalid default policy');
  }
  return normalized;
};
