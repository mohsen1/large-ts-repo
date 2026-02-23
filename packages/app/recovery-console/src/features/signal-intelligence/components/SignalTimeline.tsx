import { useMemo } from 'react';

import { type SignalFeedSnapshot } from '@domain/recovery-signal-intelligence';

interface SignalTimelineProps {
  snapshot: SignalFeedSnapshot | null;
  compact?: boolean;
}

const timelineStyle = {
  container: {
    border: '1px solid #2e7d32',
    borderRadius: 12,
    padding: 12,
  },
};

export const SignalTimeline = ({ snapshot, compact }: SignalTimelineProps) => {
  const cadence = useMemo(() => {
    if (!snapshot) {
      return [] as Array<{ time: string; signalCount: number }>;
    }

    const grouped = snapshot.pulses
      .map((pulse) => ({ time: new Date(pulse.timestamp).toISOString().slice(0, 16), signalCount: 1 }))
      .reduce<Map<string, number>>((acc, item) => {
        acc.set(item.time, (acc.get(item.time) ?? 0) + item.signalCount);
        return acc;
      }, new Map());

    return [...grouped.entries()].map(([time, signalCount]) => ({ time, signalCount }));
  }, [snapshot]);

  if (!snapshot) {
    return <section style={timelineStyle.container}>No timeline loaded</section>;
  }

  const bars = compact ? cadence.slice(-6) : cadence;

  return (
    <section style={timelineStyle.container}>
      <h3>Signal cadence</h3>
      <p>
        Latest window: {snapshot.asOf} · Facility {snapshot.facilityId}
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {bars.map((entry) => {
          const width = `${Math.min(100, entry.signalCount * 20)}%`;
          return (
            <div key={entry.time}>
              <div>{entry.time}</div>
              <div
                style={{
                  width,
                  background: '#4dd0e1',
                  height: 8,
                  borderRadius: 4,
                }}
              />
              <small>{entry.signalCount} samples</small>
            </div>
          );
        })}
      </div>
    </section>
  );
};
