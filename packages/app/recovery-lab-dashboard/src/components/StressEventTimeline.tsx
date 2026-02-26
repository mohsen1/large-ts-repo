import { useMemo } from 'react';
import { mapWithIteratorHelpers } from '@shared/type-level';

interface StressEvent {
  readonly id: string;
  readonly domain: string;
  readonly phase: 'discovery' | 'validation' | 'execution' | 'rollback';
  readonly metric: number;
  readonly startedAt: string;
  readonly endedAt?: string;
}

interface StressEventTimelineProps {
  readonly events: readonly StressEvent[];
}

type Severity = 'good' | 'warn' | 'bad';

const severityForMetric = (metric: number): Severity =>
  metric >= 80 ? 'good' : metric >= 40 ? 'warn' : 'bad';

const colorBySeverity = (severity: Severity): string => {
  switch (severity) {
    case 'good':
      return '#22c55e';
    case 'warn':
      return '#f59e0b';
    default:
      return '#ef4444';
  }
};

const isTerminal = (event: StressEvent): boolean => event.endedAt != null;

const sortEvents = (events: readonly StressEvent[]): readonly StressEvent[] => {
  return [...events].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
};

export const StressEventTimeline = ({ events }: StressEventTimelineProps): React.JSX.Element => {
  const prepared = useMemo(() => {
    const ordered = sortEvents(events);
    const phaseBuckets = ordered.reduce<Record<string, readonly StressEvent[]>>((acc, event) => {
      acc[event.phase] = [...(acc[event.phase] ?? []), event];
      return acc;
    }, {});

    const rows = mapWithIteratorHelpers<StressEvent, {
      readonly id: string;
      readonly domain: string;
      readonly phase: 'discovery' | 'validation' | 'execution' | 'rollback';
      readonly metric: number;
      readonly startedAt: string;
      readonly endedAt?: string;
      readonly severity: Severity;
      readonly terminal: boolean;
    }>(ordered, (entry) => ({
      ...entry,
      severity: severityForMetric(entry.metric),
      terminal: isTerminal(entry),
    }));

    return { phaseBuckets, rows };
  }, [events]);

  return (
    <section style={{ border: '1px solid #d5dbe3', borderRadius: 8, padding: 12 }}>
      <h2>Stress event timeline</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h3>By phase</h3>
          <ul>
            {Object.entries(prepared.phaseBuckets).map(([phase, list]) => (
              <li key={phase}>
                {phase}: {list.length}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Recent entries</h3>
          <ul>
            {prepared.rows.slice(0, 12).map((entry) => (
              <li key={entry.id} style={{ color: colorBySeverity(entry.severity) }}>
                {`${entry.domain} ${entry.phase} ${entry.metric} ${entry.terminal ? 'closed' : 'open'}`}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <pre style={{ marginTop: 12 }}>
        {JSON.stringify(prepared.phaseBuckets, null, 2)}
      </pre>
    </section>
  );
};
