import { type FC, useState } from 'react';
import { type PlanTimelineRow, type ScenarioBlueprint, type ScenarioPlan } from '@domain/recovery-cockpit-synthetic-lab';

export type ScenarioRow = ScenarioPlan & {
  readonly stepCount: number;
  readonly criticality: ScenarioPlan['severity'];
  readonly ageHours: number;
};

type SortKey = 'score' | 'age' | 'steps' | 'severity';

type SortDirection = 'asc' | 'desc';

export type SyntheticScenarioTableProps = {
  readonly tenant: string;
  readonly catalogDigest: string;
  readonly plans: ReadonlyArray<ScenarioRow>;
  readonly onSelectScenario: (scenarioId: ScenarioBlueprint['id']) => void;
  readonly selectedId: ScenarioBlueprint['id'] | undefined;
  readonly runQueue: readonly string[];
};

export const severityScore = (severity: ScenarioRow['severity']): number => {
  if (severity === 'critical') {
    return 0;
  }
  if (severity === 'high') {
    return 1;
  }
  if (severity === 'medium') {
    return 2;
  }
  return 3;
};

const headerMap: Record<SortKey, string> = {
  score: 'Score',
  age: 'Age',
  steps: 'Steps',
  severity: 'Severity',
};

const sortBy = (plans: readonly ScenarioRow[], sortKey: SortKey, direction: SortDirection): readonly ScenarioRow[] => {
  const factor = direction === 'desc' ? -1 : 1;
  return [...plans].toSorted((left, right) => {
    if (sortKey === 'score') {
      return (right.score - left.score) * factor;
    }
    if (sortKey === 'age') {
      return (right.ageHours - left.ageHours) * factor;
    }
    if (sortKey === 'steps') {
      return (right.stepCount - left.stepCount) * factor;
    }
    return (severityScore(left.severity) - severityScore(right.severity)) * factor;
  });
};

const rowClassBySeverity = (severity: ScenarioRow['criticality']): string => {
  if (severity === 'critical') {
    return 'critical';
  }
  if (severity === 'high') {
    return 'high';
  }
  if (severity === 'medium') {
    return 'medium';
  }
  return 'low';
};

const asTimelineRows = (plan: ScenarioPlan): PlanTimelineRow[] =>
  plan.steps.map((step, index) => ({
    phase: step.className,
    at: new Date(Date.now() + index * 60_000).toISOString(),
    durationMinutes: step.durationMinutes,
    value: step.durationMinutes * (index + 1),
  }));

export const SyntheticScenarioTable: FC<SyntheticScenarioTableProps> = ({
  tenant,
  catalogDigest,
  plans,
  onSelectScenario,
  selectedId,
  runQueue,
}) => {
  const [activeSort, setActiveSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'score',
    direction: 'desc',
  });

  const ordered = sortBy(plans, activeSort.key, activeSort.direction);

  const toggleSort = (next: SortKey) => {
    setActiveSort((current) =>
      current.key === next
        ? { key: next, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: next, direction: 'desc' },
    );
  };

  const selectedPlan = plans.find((plan) => plan.id === selectedId);
  const selectedTimeline = selectedPlan ? asTimelineRows(selectedPlan) : [];

  const diagnostics = selectedPlan
    ? selectedTimeline.reduce<Record<PlanTimelineRow['phase'], number>>((acc, entry) => {
      acc[entry.phase] = (acc[entry.phase] ?? 0) + entry.durationMinutes;
      return acc;
    }, {} as Record<PlanTimelineRow['phase'], number>)
    : {};

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2>Tenant: {tenant}</h2>
        <p>Catalog digest: {catalogDigest}</p>
      </header>

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => toggleSort('score')}>Sort score {headerMap[activeSort.key]}</button>
        <button type="button" onClick={() => toggleSort('age')}>Sort age {headerMap[activeSort.key]}</button>
        <button type="button" onClick={() => toggleSort('steps')}>Sort steps {headerMap[activeSort.key]}</button>
        <button type="button" onClick={() => toggleSort('severity')}>Sort severity {headerMap[activeSort.key]}</button>
      </nav>

      <section style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Severity</th>
              <th>Score</th>
              <th>Steps</th>
              <th>Age (h)</th>
              <th>Tag count</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((plan) => (
              <tr
                key={plan.id}
                style={{
                  borderLeft: `4px solid ${rowClassBySeverity(plan.criticality)}`,
                  background: plan.id === selectedId ? '#f5f7ff' : 'transparent',
                }}
                onClick={() => onSelectScenario(plan.id)}
              >
                <td>{plan.id}</td>
                <td>{plan.severity}</td>
                <td>{plan.score.toFixed(2)}</td>
                <td>{plan.stepCount}</td>
                <td>{plan.ageHours}</td>
                <td>{plan.tags.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Selected run queue</h3>
        <ul>
          {runQueue.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Selected timeline aggregate</h3>
        <pre>
          {JSON.stringify(diagnostics, null, 2)}
        </pre>
      </section>
    </section>
  );
};
