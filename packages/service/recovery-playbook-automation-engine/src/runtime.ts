import { buildPipeline, composeStages, type StageTransform } from '@domain/recovery-playbook-orchestration-core';
import { withBrand } from '@shared/core';
import { ok, type Result } from '@shared/result';
import { type SimulationSnapshot, runSimulation } from './session';
import type { PlaybookAutomationRunId } from '@domain/recovery-playbook-orchestration-core';

export interface RuntimeContext {
  readonly tenantId: string;
  readonly runId: PlaybookAutomationRunId;
}

export interface RuntimeResult {
  readonly runId: PlaybookAutomationRunId;
  readonly score: number;
  readonly warnings: readonly string[];
}

export const executeRuntime = async (
  input: RuntimeContext,
  simulation: SimulationSnapshot,
): Promise<Result<RuntimeResult, string>> => {
  const identity = ((seed: string) => seed) satisfies StageTransform<string, string>;
  const seedStage = async (value: string): Promise<string> => `seed-${value}`;
  const seeded = buildPipeline<string>(
    composeStages(
      identity,
      async (value: string): Promise<string> => {
        await runSimulation({
          ...simulation,
          scenario: value,
        });
        return seedStage(value);
      },
    ),
    withBrand(input.runId, 'AutomationRunId'),
  );

  const result = await seeded.run(input.tenantId);
  return ok({
    runId: input.runId,
    score: result.score,
    warnings: result.warnings as readonly string[],
  });
};
