import { useEffect, useMemo, useState } from 'react';
import { InMemorySyntheticRunStore } from '@data/recovery-synthetic-orchestration-store';

interface TimelineProps {
  readonly runId: string | undefined;
}

interface TimelinePoint {
  readonly label: string;
  readonly at: string;
  readonly phase: string;
}

const buildTimeline = (events: readonly { at: string; phase: string }[]): readonly TimelinePoint[] => {
  const normalized = events.toSorted((left, right) => right.at.localeCompare(left.at));
  return normalized.map((event, index) => ({
    label: `#${index + 1}`,
    at: event.at,
    phase: event.phase,
  }));
};

export const SyntheticExecutionTimeline = ({ runId }: TimelineProps) => {
  const [points, setPoints] = useState<readonly TimelinePoint[]>([]);

  useEffect(() => {
    const store = new InMemorySyntheticRunStore();
    void (async () => {
      if (!runId) {
        setPoints([]);
        return;
      }
      const runResult = await store.listEvents(runId as any, {} as any);
      if (!runResult.ok) {
        setPoints([]);
        return;
      }
      setPoints(buildTimeline(runResult.value));
    })();
  }, [runId]);

  return (
    <section>
      <h4>Execution timeline</h4>
      {points.length ? (
        <ul>
          {points.map((point) => (
            <li key={`${point.label}-${point.at}`}>
              <span>{point.label}</span>
              <strong>{point.phase}</strong>
              <em>{point.at}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p>No timeline yet</p>
      )}
    </section>
  );
};
