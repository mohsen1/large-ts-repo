import { fail, ok, type Result } from '@shared/result';
import type { DrillLabRunRepository } from '@data/recovery-drill-lab-store';
import type { OrchestratorContext, OrchestrationOutcome } from './types';
import { buildPlanFromContext, snapshotFromPlan } from './planner';
import { makeRunEnvelope, recordTelemetry } from '@data/recovery-drill-lab-store';

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export class DrillLabOrchestrator {
  constructor(private readonly repository: DrillLabRunRepository) {}

  async run(context: OrchestratorContext): Promise<Result<OrchestrationOutcome, Error>> {
    const plan = buildPlanFromContext(this.repository, context);
    const started = {
      ...snapshotFromPlan(plan),
      status: 'running' as const,
      updatedAt: new Date().toISOString(),
    } as const;

    this.repository.saveRun(started);
    recordTelemetry(makeRunEnvelope(started));

    await wait(8);

    const completed = {
      ...started,
      status: 'completed' as const,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    this.repository.saveRun(completed);
    recordTelemetry(makeRunEnvelope(completed));

    return ok({
      snapshot: completed,
      commands: plan.commands,
      errors: [],
      query: {
        workspaceId: context.workspaceId,
        scenarioId: context.scenarioId,
      },
    });
  }

  runDry(context: OrchestratorContext): Result<OrchestrationOutcome, Error> {
    const plan = buildPlanFromContext(this.repository, context);
    const snapshot = snapshotFromPlan(plan);

    if (!snapshot.id) {
      return fail(new Error('no-run'));
    }

    return ok({
      snapshot,
      commands: plan.commands,
      errors: [],
      query: {
        workspaceId: context.workspaceId,
        scenarioId: context.scenarioId,
      },
    });
  }
}

export const createOrchestrator = (repository: DrillLabRunRepository): DrillLabOrchestrator =>
  new DrillLabOrchestrator(repository);
