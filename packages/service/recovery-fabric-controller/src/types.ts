import { Brand } from '@shared/core';

import type { FabricAllocation, FabricCandidate, FabricPlanId, FabricRunId, FabricScenario, FabricTrace } from '@domain/recovery-fabric-models';

export type FabricCommand = Brand<string, 'FabricCommand'>;
export type { FabricAllocation, FabricCandidate, FabricPlanId, FabricRunId, FabricScenario, FabricTrace };

export interface FabricExecutionSnapshot {
  readonly runId: FabricRunId;
  readonly activeCandidateId: Brand<string, 'FabricCandidateId'>;
  readonly command: FabricCommand;
  readonly progressPercent: number;
  readonly lastUpdatedAt: string;
  readonly completedSteps: readonly Brand<string, 'FabricNodeId'>[];
}

export interface FabricCommandInput {
  readonly scenario: FabricScenario;
  readonly candidate: FabricCandidate;
  readonly allocation: FabricAllocation;
  readonly planId: FabricPlanId;
  readonly runId: FabricRunId;
}

export interface FabricCommandResult {
  readonly trace: FabricTrace;
  readonly candidate: FabricCandidate;
  readonly allocation: FabricAllocation;
  readonly snapshot: FabricExecutionSnapshot;
}

export interface FabricSimulationResult {
  readonly runId: FabricRunId;
  readonly predictedMinutes: number;
  readonly successProbability: number;
  readonly nodeRisk: readonly { nodeId: Brand<string, 'FabricNodeId'>; risk: number }[];
}
