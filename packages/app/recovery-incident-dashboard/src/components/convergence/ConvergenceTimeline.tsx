import { memo } from 'react';
import type { ConvergenceRunEvent } from '@domain/recovery-ops-orchestration-lab';

interface ConvergenceTimelineProps {
  readonly events: readonly ConvergenceRunEvent[];
}

const summarizeEvent = (event: ConvergenceRunEvent): string => {
  const phase = event.phase ?? 'unknown';
  const payloadSummary = typeof event.payload === 'object' && event.payload !== null
    ? JSON.stringify(event.payload).slice(0, 80)
    : String(event.payload);
  return `${event.at.slice(11, 19)} • ${event.type}/${phase} • ${payloadSummary}`;
};

export const ConvergenceTimeline = memo<ConvergenceTimelineProps>(({ events }) => {
  if (events.length === 0) {
    return <p>No events yet.</p>;
  }

  const latestFirst = [...events].toReversed();
  const grouped = latestFirst.reduce<Record<string, ConvergenceRunEvent[]>>((acc, event) => {
    const phase = event.phase ?? 'unknown';
    const bucket = acc[phase] ?? [];
    bucket.push(event);
    acc[phase] = bucket;
    return acc;
  }, {});

  return (
    <section style={{ border: '1px solid #2d3748', borderRadius: 12, padding: 16 }}>
      <h3>Timeline</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        {Object.entries(grouped).map(([phase, phaseEvents]) => (
          <article key={phase}>
            <h4 style={{ marginTop: 0 }}>{phase}</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {phaseEvents.map((event) => (
                <li key={`${event.runId}-${event.at}`} style={{ padding: 8, borderRadius: 6, background: '#0f172a' }}>
                  {summarizeEvent(event)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
});

ConvergenceTimeline.displayName = 'ConvergenceTimeline';
