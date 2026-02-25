import { createScheduler } from './scheduler';
import type { SchedulerRequest, OrchestrationResult, SchedulerRunId } from './types';

export type RunExperimentRequest<TMeta extends Record<string, unknown> = Record<string, unknown>> = SchedulerRequest<TMeta>;

export interface ExperimentOrchestrator {
  run<TMeta extends Record<string, unknown>>(request: RunExperimentRequest<TMeta>): Promise<OrchestrationResult<TMeta>>;
  getState(runId: SchedulerRunId): OrchestrationResult | undefined;
  bootstrap(): Promise<string[]>;
}

export const createAutonomyExperimentOrchestrator = (): ExperimentOrchestrator => {
  const scheduler = createScheduler();
  const states = new Map<string, OrchestrationResult>();

  const run = async <TMeta extends Record<string, unknown>>(request: RunExperimentRequest<TMeta>): Promise<OrchestrationResult<TMeta>> => {
    const output = await scheduler.run(request);
    states.set(request.intent.runId, output);
    return output as OrchestrationResult<TMeta>;
  };

  const getState = (runId: SchedulerRunId): OrchestrationResult | undefined => states.get(runId);
  const bootstrap = async (): Promise<string[]> => {
    const loaded = await scheduler.bootstrap();
    return [...loaded];
  };

  return {
    run,
    getState,
    bootstrap,
  };
};

export { createAutonomyExperimentOrchestrator as createOrchestrator };
