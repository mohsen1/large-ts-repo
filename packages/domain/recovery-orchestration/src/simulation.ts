import { buildExecutionPlan } from './planner';
import { topologicalOrder } from './utils';
import type { RecoveryProgram, RecoveryRunState } from './types';

export interface RecoverySimCheckpoint {
  readonly stepId: string;
  readonly success: boolean;
  readonly elapsedMs: number;
}

export interface RecoverySimulationResult {
  readonly runId: RecoveryRunState['runId'];
  readonly successProbability: number;
  readonly expectedDurationMinutes: number;
  readonly orderedSteps: readonly string[];
  readonly checkpoints: readonly RecoverySimCheckpoint[];
}

const randomOutcome = (command: string): boolean =>
  command.length % 2 === 1;

export const simulateRun = (program: RecoveryProgram, run: RecoveryRunState): RecoverySimulationResult => {
  const plan = buildExecutionPlan({ runId: run.runId, program });
  const orderedStepIds = topologicalOrder(program).filter((stepId) => plan.sequence.some((segment) => segment.stepId === stepId));
  const checkpoints = plan.sequence.map((segment) => ({
    stepId: segment.stepId,
    success: randomOutcome(segment.command),
    elapsedMs: segment.timeoutMs / 2,
  }));
  const successProbability = checkpoints.reduce(
    (acc, checkpoint, index) => acc * (checkpoint.success ? 1 : 0.3 / (index + 1)),
    1,
  );
  const expectedDurationMinutes = Math.max(1, orderedStepIds.length * 0.5);
  return {
    runId: run.runId,
    successProbability,
    expectedDurationMinutes,
    orderedSteps: orderedStepIds,
    checkpoints,
  };
};
