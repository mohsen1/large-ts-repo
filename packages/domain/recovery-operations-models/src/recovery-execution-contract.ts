import type { Brand } from '@shared/core';

import type { CommandArtifact, CommandArtifactEnvelope, CommandArtifactPatch } from './incident-command-artifacts';
import type { CommandWindowForecast } from './command-window-forecast';

export type ExecutionState = 'planned' | 'initialized' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'rolled_back';

export interface ExecutionIntent {
  readonly intentId: Brand<string, 'ExecutionIntentId'>;
  readonly commandId: Brand<string, 'CommandArtifactId'>;
  readonly state: ExecutionState;
  readonly approvedBy?: string;
  readonly approvalAt?: string;
  readonly targetState: ExecutionState;
}

export interface ExecutionContract {
  readonly contractId: Brand<string, 'ExecutionContractId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly command: CommandArtifact;
  readonly artifactEnvelope?: CommandArtifactEnvelope;
  readonly forecast?: CommandWindowForecast;
  readonly intent: ExecutionIntent;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
  readonly retries: {
    readonly max: number;
    readonly used: number;
  };
}

export interface ExecutionAction {
  readonly actionId: Brand<string, 'ExecutionActionId'>;
  readonly step: string;
  readonly owner: string;
  readonly command: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly output?: string;
}

export interface ExecutionPlan {
  readonly planId: Brand<string, 'ExecutionPlanId'>;
  readonly state: ExecutionState;
  readonly title: string;
  readonly priority: 'p0' | 'p1' | 'p2';
  readonly steps: readonly ExecutionAction[];
}

export interface ExecutionSummary {
  readonly contractId: Brand<string, 'ExecutionContractId'>;
  readonly executionMs: number;
  readonly state: ExecutionState;
  readonly stepCount: number;
  readonly successRate: number;
  readonly updatedAt: string;
}

export interface ExecutionPatchResult {
  readonly contractId: Brand<string, 'ExecutionContractId'>;
  readonly commandPatch: CommandArtifactPatch;
  readonly updatedContract: ExecutionContract;
  readonly changedFields: readonly string[];
}

export interface ExecutionPolicy {
  readonly policyId: Brand<string, 'ExecutionPolicyId'>;
  readonly requireOperatorApproval: boolean;
  readonly requireForecastConfidence: number;
  readonly maxConcurrentCommands: number;
  readonly escalationPath: readonly string[];
}

export interface ExecutionEnvelope {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly contract: ExecutionContract;
  readonly policy: ExecutionPolicy;
  readonly summary?: ExecutionSummary;
}

export type ExecutionStateTransition = Readonly<[
  from: ExecutionState,
  to: ExecutionState,
  timestamp: string,
  reason?: string,
]>;

export const isTerminalExecutionState = (state: ExecutionState): boolean => state === 'succeeded' || state === 'failed' || state === 'rolled_back';

export const canTransition = (from: ExecutionState, to: ExecutionState): boolean => {
  switch (from) {
    case 'planned':
      return to === 'initialized' || to === 'failed';
    case 'initialized':
      return to === 'running' || to === 'failed';
    case 'running':
      return to === 'blocked' || to === 'succeeded' || to === 'failed';
    case 'blocked':
      return to === 'running' || to === 'rolled_back';
    case 'failed':
      return to === 'initialized' || to === 'rolled_back';
    case 'succeeded':
    case 'rolled_back':
      return false;
  }
};

export const toExecutionSummary = (contract: ExecutionContract, transitions: readonly ExecutionStateTransition[]): ExecutionSummary => {
  const started = transitions.find((entry) => entry[1] === 'initialized')?.[2] ?? transitions[0]?.[2] ?? contract.createdAt;
  const ended = transitions.at(-1)?.[2] ?? contract.updatedAt;
  const executionMs = Math.max(0, Date.parse(ended) - Date.parse(started));
  const successfulTransitions = transitions.filter((transition) => transition[1] === 'succeeded').length;
  const stepCount = transitions.length;

  return {
    contractId: contract.contractId,
    executionMs,
    state: contract.intent.state,
    stepCount,
    successRate: transitions.length > 0 ? successfulTransitions / transitions.length : 0,
    updatedAt: new Date().toISOString(),
  };
};

export const nextIntentState = (
  state: ExecutionState,
  policy: ExecutionPolicy,
  isForecastSafe: boolean,
): ExecutionState => {
  if (!isForecastSafe && policy.requireForecastConfidence > 0.5) {
    return state === 'planned' ? 'initialized' : state;
  }

  if (state === 'planned') {
    return 'initialized';
  }
  if (state === 'initialized') {
    return 'running';
  }
  if (state === 'blocked') {
    return 'running';
  }

  return state;
};

export const isExecutionAllowedByPolicy = (contract: ExecutionContract, policy: ExecutionPolicy): boolean => {
  if (policy.requireOperatorApproval && !contract.intent.approvedBy) {
    return false;
  }

  if (contract.forecast && contract.forecast.confidence < policy.requireForecastConfidence) {
    return false;
  }

  return contract.intent.state !== 'blocked' && contract.retries.used < policy.maxConcurrentCommands;
};
