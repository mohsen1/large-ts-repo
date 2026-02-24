import { memo, useMemo } from 'react';
import { useLabEventStream } from '../../hooks/useLabEventStream';
import type { LabRuntimeEvent } from '@domain/recovery-lab-console-core';

interface LabEventFeedProps {
  readonly events: readonly LabRuntimeEvent[];
  readonly pageSize?: number;
}

const levelColor = {
  'plugin.started': '#9ad5ff',
  'plugin.completed': '#8effae',
  'plugin.failed': '#ff9aa2',
  'run.complete': '#f2df7e',
} satisfies Record<LabRuntimeEvent['kind'], string>;

const eventLine = (event: LabRuntimeEvent): string => {
  switch (event.kind) {
    case 'plugin.started':
      return `${event.pluginId} started at ${event.startedAt} (${event.stage})`;
    case 'plugin.completed':
      return `${event.pluginId} completed in ${event.durationMs}ms (${event.stage})`;
    case 'plugin.failed':
      return `${event.pluginId} failed: ${event.error}`;
    case 'run.complete':
      return `run ${event.runId} complete with ${event.diagnostics.stageCount} stages`;
    default:
      return 'unhandled';
  }
};

export const LabEventFeed = memo(({ events, pageSize = 12 }: LabEventFeedProps) => {
  const { filtered, hasMore, loadMore, reset, streamByPhase } = useLabEventStream({ events, pageSize });
  const ordered = useMemo(() => [...filtered].reverse(), [filtered]);
  const phaseEntries = Object.entries(streamByPhase);
  const phaseSummaries = phaseEntries
    .map(([phase, values]) => `${phase}:${values.length}`)
    .join(' • ');

  return (
    <section style={{ border: '1px solid #24324a', borderRadius: '0.6rem', padding: '0.75rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
        <h3>Event Feed</h3>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" onClick={reset} disabled={!hasMore}>
            reset
          </button>
          <button type="button" onClick={loadMore} disabled={!hasMore}>
            show more
          </button>
        </div>
      </header>
      <p style={{ opacity: 0.85, margin: 0, marginBottom: '0.4rem' }}>{phaseSummaries}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
        {ordered.map((event, index) => (
          <li
            key={`${event.kind}-${index}`}
            style={{
              color: levelColor[event.kind],
              borderBottom: '1px dashed rgba(255,255,255,0.15)',
              paddingBottom: '0.3rem',
            }}
          >
            {eventLine(event)}
          </li>
        ))}
      </ul>
    </section>
  );
});
