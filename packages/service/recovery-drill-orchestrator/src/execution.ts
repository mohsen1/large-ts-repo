import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { DrillRunContext } from '@domain/recovery-drill';
import { parseISODate } from '@domain/recovery-drill/src/utils';
import type { DrillRunPlan } from './types';
import type { DrillRunRecord } from '@data/recovery-drill-store';

export interface StepExecutor {
  executeStep(stepId: string, context: Pick<DrillRunContext, 'runId'>): Promise<Result<string, Error>>;
}

const defaultExecutor: StepExecutor = {
  async executeStep(stepId: string): Promise<Result<string, Error>> {
    return ok(`executed:${stepId}`);
  },
};

export class RecoveryDrillExecutor {
  constructor(
    private readonly executor: StepExecutor = defaultExecutor,
    private readonly startedAt = parseISODate(new Date().toISOString()),
  ) {}

  async execute(context: DrillRunContext, plan: DrillRunPlan): Promise<Result<Omit<DrillRunRecord, 'context'>, Error>> {
    const checkpoints: string[] = [];

    for (const stepId of plan.scenarioOrder) {
      const stepResult = await this.executor.executeStep(stepId, { runId: context.runId });
      if (!stepResult.ok) {
        return fail(stepResult.error);
      }
      checkpoints.push(stepResult.value);
    }

    const successRate = plan.scenarioOrder.length === 0 ? 0 : Math.min(1, checkpoints.length / plan.scenarioOrder.length);
    return ok({
      id: context.runId,
      templateId: plan.templateId,
      status: plan.scenarioOrder.length === 0 ? 'failed' : 'succeeded',
      mode: context.mode,
      profile: {
        runId: context.runId,
        elapsedMs: Math.max(0, Date.now() - this.startedAt),
        estimatedMs: plan.estimatedMs,
        queueDepth: plan.concurrency,
        successRate,
      },
      checkpoints,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      plan: JSON.stringify(plan),
    });
  }
}
