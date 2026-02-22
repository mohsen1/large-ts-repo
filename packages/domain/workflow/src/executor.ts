import { WorkflowDef, WorkflowState, StepStatus } from './graph';

export interface ExecutionContext {
  workflow: WorkflowDef;
  state: Map<string, WorkflowState>;
  startedAt: string;
}

export const createState = (workflow: WorkflowDef): ExecutionContext => ({
  workflow,
  startedAt: new Date().toISOString(),
  state: new Map(workflow.steps.map((step) => [step.id, { step: step.id, status: 'created', at: new Date().toISOString() }] as [string, WorkflowState])),
});

export const mark = (ctx: ExecutionContext, step: string, status: StepStatus, error?: string): ExecutionContext => {
  const current = ctx.state.get(step);
  if (!current) return ctx;
  ctx.state.set(step, { ...current, status, at: new Date().toISOString(), error });
  return ctx;
};

export const progress = (ctx: ExecutionContext): string[] => {
  const done = new Set(
    Array.from(ctx.state.entries())
      .filter(([, value]) => value.status === 'done')
      .map(([key]) => key)
  );

  return ctx.workflow.steps
    .filter((step) => step.dependsOn.every((dependency) => done.has(dependency)))
    .filter((step) => (ctx.state.get(step.id)?.status ?? 'created') === 'created')
    .map((step) => step.id);
};

export const canRetry = (ctx: ExecutionContext, step: string): boolean => {
  const state = ctx.state.get(step);
  if (!state || state.status !== 'failed') return false;
  const stepDef = ctx.workflow.steps.find((item) => item.id === step);
  if (!stepDef) return false;
  return true;
};
