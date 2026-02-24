import { PolicyPluginEnvelope } from '@service/policy-orchestration-engine';
import { useMemo } from 'react';
import type { CSSProperties } from 'react';

interface PolicyPluginLogTimelineProps {
  envelope: PolicyPluginEnvelope | null;
}

const timelineFrom = (seed: PolicyPluginEnvelope | null) =>
  seed?.pluginLog?.map((entry, order) => ({
    order,
    entry,
  })) ?? [];

const classify = (entry: string): 'info' | 'warn' | 'error' => {
  if (entry.includes('error')) return 'error';
  if (entry.includes('warn')) return 'warn';
  return 'info';
};

const toStyle = (kind: 'info' | 'warn' | 'error'): CSSProperties => {
  switch (kind) {
    case 'warn':
      return { color: '#7c5f00' };
    case 'error':
      return { color: '#9a1b1b', fontWeight: 'bold' };
    default:
      return { color: '#0b5f4d' };
  }
};

export const PolicyPluginLogTimeline = ({ envelope }: PolicyPluginLogTimelineProps) => {
  const timeline = useMemo(
    () => timelineFrom(envelope).filter((entry) => entry.entry.length > 0),
    [envelope],
  );

  if (timeline.length === 0) {
    return <p>No plugin log entries yet.</p>;
  }

  return (
    <section>
      <h3>Plugin Log Timeline</h3>
      <ul>
        {timeline.map((entry) => {
          const kind = classify(entry.entry);
          return (
            <li key={`${entry.order}:${entry.entry}`}>
              <span>{entry.order}</span>
              <span style={{ marginLeft: 6, ...toStyle(kind) }}>{entry.entry}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
