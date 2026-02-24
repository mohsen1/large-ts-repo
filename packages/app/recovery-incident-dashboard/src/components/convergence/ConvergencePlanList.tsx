import { memo, useMemo } from 'react';
import type { ConvergencePlan } from '@domain/recovery-ops-orchestration-lab';

interface ConvergencePlanListProps {
  readonly plans: readonly ConvergencePlan[];
  readonly selectedPlanId?: ConvergencePlan['id'];
  readonly onSelect: (planId: ConvergencePlan['id']) => void;
}

const planToTuple = (plan: ConvergencePlan): readonly [number, ConvergencePlan['id'], string, string] => {
  const dependencyCount = plan.steps.reduce((acc, step) => acc + step.dependencies.length, 0);
  const argCount = plan.steps.reduce((acc, step) => acc + step.arguments.length, 0);
  return [plan.score, plan.id, plan.title, `${dependencyCount}|${argCount}`];
};

const toPlanRow = (plan: ConvergencePlan, selected: boolean) => {
  const [score, id, title, stats] = planToTuple(plan);
  return {
    id,
    selected,
    title,
    score,
    steps: plan.steps.length,
    stats,
  };
};

export const ConvergencePlanList = memo<ConvergencePlanListProps>(({ plans, selectedPlanId, onSelect }) => {
  const rows = useMemo(
    () => plans
      .map((plan) => toPlanRow(plan, plan.id === selectedPlanId))
      .toSorted((left, right) => right.score - left.score),
    [plans, selectedPlanId],
  );

  return (
    <section style={{ border: '1px solid #2d3748', borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Plan Library</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((row) => (
          <li
            key={row.id}
            aria-current={row.selected}
            style={{
              border: row.selected ? '1px solid #63b3ed' : '1px solid transparent',
              borderRadius: 8,
              padding: 10,
              background: row.selected ? '#122638' : 'transparent',
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr 0.4fr 0.3fr 0.4fr',
                gap: 8,
                textAlign: 'left',
              }}
            >
              <span>{row.title}</span>
              <span>score {row.score}</span>
              <span>steps {row.steps}</span>
              <span>deps/args {row.stats}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
});

ConvergencePlanList.displayName = 'ConvergencePlanList';
