import { FC, useMemo } from 'react';
import {
  type PlanTimelineRow,
  type ScenarioBlueprint,
} from '@domain/recovery-cockpit-synthetic-lab';

type TimelineNode = {
  readonly at: number;
  readonly phase: PlanTimelineRow['phase'];
  readonly durationMinutes: number;
  readonly value: number;
  readonly index: number;
};

export type SyntheticPlanTimelineProps = {
  readonly scenario: ScenarioBlueprint | undefined;
};

const inferTimeline = (scenario: ScenarioBlueprint | undefined): readonly TimelineNode[] => {
  if (scenario === undefined) {
    return [];
  }
  return scenario.steps
    .toSorted((left, right) => left.durationMinutes - right.durationMinutes)
    .flatMap((step, index) => {
      const row: PlanTimelineRow = {
        phase: step.className,
        at: new Date(Date.now() + index * 60_000).toISOString(),
        durationMinutes: step.durationMinutes,
        value: step.durationMinutes * (index + 1),
      };
      return {
        at: Date.parse(row.at),
        phase: row.phase,
        durationMinutes: row.durationMinutes,
        value: row.value,
        index,
      } as TimelineNode;
    });
};

const phaseIntensity = (timeline: readonly TimelineNode[]): Record<PlanTimelineRow['phase'], number> => {
  return timeline.reduce<Record<PlanTimelineRow['phase'], number>>((acc, entry) => {
    acc[entry.phase] = (acc[entry.phase] ?? 0) + entry.value;
    return acc;
  }, {} as Record<PlanTimelineRow['phase'], number>);
};

const toLabel = (value: number, precision: number): string => `${value.toFixed(precision)}m`;

export const SyntheticPlanTimeline: FC<SyntheticPlanTimelineProps> = ({ scenario }) => {
  const timeline = useMemo(() => inferTimeline(scenario), [scenario]);
  const aggregates = useMemo(() => phaseIntensity(timeline), [timeline]);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h3>Timeline composition</h3>
      {timeline.length === 0 ? (
        <p>Choose a scenario to view timeline</p>
      ) : (
        <>
          <ul>
            {timeline.map((entry) => (
              <li key={`${entry.phase}-${entry.index}-${entry.at}`}>
                {entry.phase} · step#{entry.index + 1} · {toLabel(entry.durationMinutes, 1)}
              </li>
            ))}
          </ul>
          <section>
            <h4>Duration by phase</h4>
            <table>
              <tbody>
                {Object.entries(aggregates).map(([phase, score]) => (
                  <tr key={phase}>
                    <td>{phase}</td>
                    <td>{toLabel(score, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </section>
  );
};
