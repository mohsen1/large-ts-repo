import { RecoveryAction } from '@domain/recovery-cockpit-models';
import { Pipeline } from '@shared/util';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';

export const resolveExecutionOrder = (actions: readonly RecoveryAction[]): RecoveryAction[] => {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const actionsById = new Map<string, RecoveryAction>();

  for (const action of actions) {
    actionsById.set(action.id, action);
    inDegree.set(action.id, action.dependencies.length);
    outgoing.set(action.id, []);
  }

  for (const action of actions) {
    for (const dep of action.dependencies) {
      outgoing.get(dep)?.push(action.id);
    }
  }

  const ready = [...actions.filter((action) => (inDegree.get(action.id) ?? 0) === 0)];
  const ordered: RecoveryAction[] = [];

  while (ready.length > 0) {
    const action = ready.shift();
    if (!action) continue;
    ordered.push(action);

    for (const next of outgoing.get(action.id) ?? []) {
      const nextIncoming = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextIncoming);
      if (nextIncoming <= 0) {
        const nextAction = actionsById.get(next);
        if (nextAction) {
          ready.push(nextAction);
        }
      }
    }
  }

  return ordered.length === actions.length ? ordered : [...actions];
};

export const groupByRegion = (actions: readonly RecoveryAction[]): Record<string, RecoveryAction[]> => {
  return actions.reduce((acc, action) => {
    acc[action.region] = acc[action.region] ?? [];
    acc[action.region].push(action);
    return acc;
  }, {} as Record<string, RecoveryAction[]>);
};

export const sortByDuration = (actions: readonly RecoveryAction[]): RecoveryAction[] =>
  [...actions].sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes);

export const tagHistogram = (actions: readonly RecoveryAction[]): Record<string, number> => {
  const values: Record<string, number> = {};
  for (const action of actions) {
    for (const tag of action.tags) {
      values[tag] = (values[tag] ?? 0) + 1;
    }
  }
  return values;
};

export const runPlannerPipeline = (
  plan: RecoveryPlan,
  mutate: Array<(input: RecoveryPlan) => RecoveryPlan>,
): RecoveryPlan => {
  const pipeline = new Pipeline<RecoveryPlan>();
  for (const step of mutate) {
    pipeline.use(step);
  }
  return pipeline.run(plan);
};

export const summarizePlan = (plan: RecoveryPlan): { plan: RecoveryPlan; tags: readonly string[]; actionCount: number } => ({
  plan,
  tags: [...new Set(plan.actions.flatMap((action) => action.tags))],
  actionCount: plan.actions.length,
});
