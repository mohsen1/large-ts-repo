import { useMemo } from 'react';
import type { FusionSignal } from '@domain/recovery-fusion-intelligence';

interface FusionSignalFeedProps {
  readonly signals: readonly FusionSignal[];
  readonly selectedWaveId?: string;
  readonly onFilter: (source: string | undefined) => void;
}

interface GroupedSignals {
  readonly source: string;
  readonly count: number;
  readonly maxSeverity: number;
  readonly signals: readonly FusionSignal[];
}

const normalizeSource = (source: string): string => (source.length === 0 ? 'unknown' : source);

const classify = (value: number): 'green' | 'amber' | 'red' => {
  if (value >= 0.75) return 'red';
  if (value >= 0.45) return 'amber';
  return 'green';
};

export const FusionSignalFeed = ({ signals, selectedWaveId, onFilter }: FusionSignalFeedProps) => {
  const groups = useMemo<GroupedSignals[]>(() => {
    const map = signals.reduce<Record<string, FusionSignal[]>>((acc, signal) => {
      const key = normalizeSource(signal.source);
      acc[key] = [...(acc[key] ?? []), signal];
      return acc;
    }, {});

    return Object.entries(map)
      .map(([source, grouped]) => {
        const maxSeverity = grouped.reduce((max, signal) => Math.max(max, signal.severity), 0);
        return {
          source,
          count: grouped.length,
          maxSeverity,
          signals: grouped,
        };
      })
      .sort((a, b) => b.maxSeverity - a.maxSeverity);
  }, [signals]);

  const filteredSignals = useMemo(() => {
    if (!selectedWaveId) {
      return signals;
    }

    return signals.filter((signal) => signal.id.includes(selectedWaveId));
  }, [selectedWaveId, signals]);

  return (
    <section className="fusion-signal-feed">
      <div className="fusion-signal-header">Signals ({filteredSignals.length})</div>
      <div className="fusion-signal-controls">
        <button type="button" onClick={() => onFilter(undefined)}>
          All signals
        </button>
      </div>
      <div className="fusion-signal-groups">
        {groups.map((group) => {
          const severityClass = classify(group.maxSeverity);
          return (
            <article key={group.source} className={`fusion-signal-group ${severityClass}`}>
              <h4>{group.source}</h4>
              <p>
                {group.count} signals • max {Math.round(group.maxSeverity * 100)}
              </p>
              <ul>
                {group.signals.slice(0, 3).map((signal) => (
                  <li key={signal.id}>
                    {signal.id} • conf {Math.round(signal.confidence * 100)}%
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      {filteredSignals.length === 0 ? <p className="fusion-empty">No signals for selected wave</p> : null}
    </section>
  );
};
