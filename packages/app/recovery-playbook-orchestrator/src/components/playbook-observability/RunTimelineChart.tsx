import { memo, useMemo } from 'react';
import type { TelemetryManifest } from '@domain/recovery-playbook-observability-core';

export interface TimelineEvent {
  readonly token: string;
  readonly parts: readonly string[];
}

export interface RunTimelineChartProps {
  readonly manifest?: TelemetryManifest;
  readonly scopeFilter?: string;
  readonly compact?: boolean;
}

const splitTimeline = (manifest?: TelemetryManifest): readonly TimelineEvent[] =>
  (manifest?.timeline ?? []).map((entry) => ({
    token: entry,
    parts: entry.split(':'),
  }));

const bucketStyle = (channel?: string): string => {
  switch (channel) {
    case 'raw':
      return 'raw';
    case 'structured':
      return 'structured';
    case 'anomaly':
      return 'anomaly';
    case 'forecast':
      return 'forecast';
    case 'annotation':
      return 'annotation';
    default:
      return 'aggregated';
  }
};

const eventKey = (event: TimelineEvent, index: number): string => `${event.token}:${index}`;

export const RunTimelineChart = memo(({
  manifest,
  scopeFilter,
  compact = false,
}: RunTimelineChartProps) => {
  const events = useMemo(() => splitTimeline(manifest), [manifest]);

  const visible = useMemo(
    () =>
      scopeFilter
        ? events.filter((event) => event.parts.includes(scopeFilter))
        : events,
    [events, scopeFilter],
  );

  const channelList = manifest?.channels ?? [];

  const countByChannel = useMemo(() => {
    const base = new Map<string, number>();
    for (const event of visible) {
      const channel = event.parts[0] ?? 'aggregated';
      base.set(channel, (base.get(channel) ?? 0) + 1);
    }
    return [...base.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visible]);

  return (
    <section className="run-timeline-chart">
      <header>
        <h3>Run timeline</h3>
        <p>Events: {visible.length}</p>
      </header>
      <div className="run-timeline-chart__meta">
        <p>Channels: {channelList.join(', ') || 'none'}</p>
        <ul>
          {countByChannel.map(([channel, count]) => (
            <li key={`${channel}:${count}`}>
              {channel}: {count}
            </li>
          ))}
        </ul>
      </div>
      <ol className="run-timeline-chart__list">
        {visible.map((event, index) => {
          const [channel, scope, type] = event.parts;
          return (
            <li key={eventKey(event, index)} className={`run-timeline-chart__entry ${bucketStyle(channel)} ${compact ? 'compact' : ''}`}>
              <span className="run-timeline-chart__scope">{scope ?? 'none'}</span>
              <span className="run-timeline-chart__type">{type ?? 'event'}</span>
              <span className="run-timeline-chart__token">{event.token}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

RunTimelineChart.displayName = 'RunTimelineChart';
