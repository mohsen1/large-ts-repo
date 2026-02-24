import { type FC, memo } from 'react';
import type { TemporalTimelineEntry, TemporalStudioMode } from '../types';

interface TimelineProps {
  readonly mode: TemporalStudioMode;
  readonly entries: readonly TemporalTimelineEntry[];
  readonly selected?: TemporalTimelineEntry['stage'];
  readonly onSelect?: (stage: TemporalTimelineEntry['stage']) => void;
}

interface TimelineItemProps {
  readonly entry: TemporalTimelineEntry;
  readonly active: boolean;
  readonly onSelect: (stage: TemporalTimelineEntry['stage']) => void;
}

const stateColor: Record<TemporalTimelineEntry['state'], string> = {
  pending: '#64748b',
  active: '#f59e0b',
  complete: '#22c55e',
  error: '#ef4444',
};

const TimelineItem: FC<TimelineItemProps> = memo(({ entry, active, onSelect }) => {
  return (
    <article
      onClick={() => {
        onSelect(entry.stage);
      }}
      style={{
        display: 'grid',
        gap: '0.5rem',
        gridTemplateColumns: '100px 1fr auto',
        alignItems: 'center',
        padding: '0.6rem',
        marginBottom: '0.5rem',
        borderRadius: '0.45rem',
        border: `1px solid ${active ? '#818cf8' : '#334155'}`,
        background: active ? '#1e293b' : '#0f172a',
        cursor: 'pointer',
      }}
    >
      <span style={{ color: stateColor[entry.state] }}>●</span>
      <span>
        <strong>{entry.stage}</strong>
        <br />
        <small>{entry.message}</small>
      </span>
      <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>{entry.startedAt.slice(11, 19)}</span>
    </article>
  );
});

TimelineItem.displayName = 'TimelineItem';

export const TemporalTimelineChart: FC<TimelineProps> = ({ mode, entries, selected, onSelect }) => {
  const ordered = [...entries].toSorted((left, right) => left.startedAt.localeCompare(right.startedAt));
  const accent = mode === 'runtime' ? '#60a5fa' : mode === 'signals' ? '#a78bfa' : mode === 'diagnostics' ? '#f59e0b' : '#34d399';

  return (
    <section
      style={{
        border: `1px solid ${accent}`,
        borderRadius: '0.5rem',
        padding: '1rem',
        background: '#0f172a',
      }}
    >
      <h3 style={{ color: '#e2e8f0', marginTop: 0 }}>Temporal Timeline</h3>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
        mode: {mode}, events: {ordered.length}
      </div>
      <div>
        {ordered.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No timeline entries yet. Run a plan to materialize trace.</p>
        ) : (
          ordered.map((entry) => (
            <TimelineItem
              key={`${entry.stage}-${entry.startedAt}`}
              entry={entry}
              active={selected === entry.stage}
              onSelect={() => {
                onSelect?.(entry.stage);
              }}
            />
          ))
        )}
      </div>
    </section>
  );
};

export const buildStageBuckets = <TEntry extends { readonly stage: string }>(
  entries: readonly TEntry[],
): ReadonlyMap<TEntry['stage'], readonly TEntry[]> => {
  const map = new Map<TEntry['stage'], TEntry[]>();
  for (const item of entries) {
    const bucket = map.get(item.stage) ?? [];
    bucket.push(item);
    map.set(item.stage, bucket);
  }

  return new Map(
    [...map.entries()].map(([key, values]) => [
      key,
      values.toSorted((left, right) => String(left.stage).localeCompare(String(right.stage))),
    ]),
  );
};

export const stageBucketSummary = <TEntry extends { readonly stage: string }>(
  buckets: ReadonlyMap<TEntry['stage'], readonly TEntry[]>,
): readonly { stage: string; count: number }[] =>
  [...buckets.entries()]
    .map(([stage, values]) => ({
      stage: String(stage),
      count: values.length,
    }))
    .toSorted((left, right) => right.count - left.count);
