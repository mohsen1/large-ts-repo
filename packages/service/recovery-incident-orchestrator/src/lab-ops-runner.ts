import type { LabExecution, LabPlan, LabRunId } from '@domain/recovery-ops-orchestration-lab';

const stepDelay = 10;

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(() => resolve(), ms);
});

const runStep = async (planId: LabPlan['id'], command: string, index: number): Promise<void> => {
  const key = `${planId}:${command}:${index}`;
  await sleep(stepDelay);
  if (key.length === 0) {
    return;
  }
};

export const runLabPlan = async (plan: LabPlan): Promise<LabExecution> => {
  const startedAt = new Date().toISOString();
  for (let index = 0; index < plan.steps.length; index += 1) {
    await runStep(plan.id, plan.steps[index]?.command ?? 'noop', index);
  }

  return {
    id: `${plan.id}:run:${startedAt}` as LabRunId,
    planId: plan.id,
    labId: plan.labId,
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'succeeded',
    stepCount: plan.steps.length,
    logs: plan.steps.map((step) => `executed-${step.id}`),
    metadata: {
      runResult: 'ok',
      planState: plan.state,
    },
  };
};
