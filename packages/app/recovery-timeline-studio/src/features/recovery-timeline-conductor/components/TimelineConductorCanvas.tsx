import { Fragment, useMemo, useState } from 'react';
import type { RecoveryTimelineEvent, TimelinePhase } from '@domain/recovery-timeline';
import { type ConductorTimelineMetric } from '../types';

interface TimelineConductorCanvasProps {
  readonly events: readonly RecoveryTimelineEvent[];
  readonly metric: ConductorTimelineMetric;
}

const phaseSort: Record<TimelinePhase, number> = {
  prepare: 0,
  mitigate: 1,
  restore: 2,
  verify: 3,
  stabilize: 4,
};

function riskRing(score: number): 'green' | 'yellow' | 'red' {
  if (score < 35) {
    return 'green';
  }
  if (score < 65) {
    return 'yellow';
  }
  return 'red';
}

function eventKey(event: RecoveryTimelineEvent, index: number): string {
  return `${event.id}-${index}-${event.phase}`;
}

export function TimelineConductorCanvas({ events, metric }: TimelineConductorCanvasProps) {
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...events].sort((left, right) => phaseSort[left.phase] - phaseSort[right.phase]),
    [events],
  );
  const totals = ordered.reduce<Record<TimelinePhase, number>>(
    (acc, event) => ({
      ...acc,
      [event.phase]: (acc[event.phase] ?? 0) + 1,
    }),
    {
      prepare: 0,
      mitigate: 0,
      restore: 0,
      verify: 0,
      stabilize: 0,
    },
  );

  return (
    <section>
      <h3>Conductor Canvas</h3>
      <p>
        timeline has {metric.phaseCount} phases and average risk {metric.avgRisk.toFixed(1)}
      </p>

      <ul>
        {Object.entries(totals).map(([phase, total]) => {
          return (
            <li key={phase}>
              {phase}: {total}
            </li>
          );
        })}
      </ul>

      <div>
        {ordered.map((event, index) => {
          const open = openEventId === event.id;
          return (
            <Fragment key={eventKey(event, index)}>
              <button
                type="button"
                onClick={() => setOpenEventId((current) => (current === event.id ? null : event.id))}
              >
                <span>{event.title}</span>
                <span>{event.riskScore}</span>
                <span>{riskRing(event.riskScore)}</span>
              </button>
              {open ? <pre>{JSON.stringify(event, null, 2)}</pre> : null}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
