import { useMemo, useState } from 'react';
import type { QuantumInput, SignalKind, SignalMeta, SignalWeight } from '../types';

interface QuantumSignalTimelineProps {
  readonly input: QuantumInput;
}

interface QuantumSignalTimelineFilters {
  readonly kind: SignalKind | 'all';
  readonly weight: SignalWeight | 'all';
}

const formatSignal = (value: SignalMeta) => `${value.actor} / ${value.channel} / ${value.note}`;
const sortSignals = (values: readonly SignalMeta[], reverse = false) =>
  [...values].sort((left, right) => (reverse ? right.timestamp.localeCompare(left.timestamp) : left.timestamp.localeCompare(right.timestamp)));

export const QuantumSignalTimeline = ({ input }: QuantumSignalTimelineProps) => {
  const [filters, setFilters] = useState<QuantumSignalTimelineFilters>({ kind: 'all', weight: 'all' });

  const grouped = useMemo(() => {
    const groupedMap = new Map<string, SignalMeta[]>();
    for (const signal of input.signals.values) {
      const visible =
        (filters.kind === 'all' || signal.kind === filters.kind) &&
        (filters.weight === 'all' || signal.weight === filters.weight);
      if (!visible) {
        continue;
      }

      const key = `${signal.kind}:${signal.weight}`;
      const bucket = groupedMap.get(key) ?? [];
      groupedMap.set(key, [...bucket, signal]);
    }
    return [...groupedMap.entries()]
      .map(([key, values]) => ({ key, values: sortSignals(values) }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }, [filters.kind, filters.weight, input.signals.values]);

  const kindCounts = useMemo(
    () =>
      input.signals.values.reduce(
        (acc, signal) => ({
          ...acc,
          [signal.kind]: [...acc[signal.kind], signal],
        }),
        {
          control: [] as SignalMeta[],
          metric: [] as SignalMeta[],
          policy: [] as SignalMeta[],
          signal: [] as SignalMeta[],
        },
      ),
    [input.signals.values],
  );

  return (
    <section>
      <h3>Signal Timeline</h3>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <label>
          Kind
          <select
            value={filters.kind}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, kind: event.target.value as QuantumSignalTimelineFilters['kind'] }))
            }
          >
            <option value="all">all</option>
            <option value="policy">policy</option>
            <option value="signal">signal</option>
            <option value="control">control</option>
            <option value="metric">metric</option>
          </select>
        </label>
        <label>
          Weight
          <select
            value={filters.weight}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, weight: event.target.value as QuantumSignalTimelineFilters['weight'] }))
            }
          >
            <option value="all">all</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </label>
      </div>

      {Object.entries(kindCounts).map(([kind, values]) => (
        <p key={kind}>
          {kind}: {values.length}
        </p>
      ))}

      {input.signals.values.length === 0 ? <p>No signal events in this payload.</p> : null}
      <div style={{ display: 'grid', gap: 16 }}>
        <section>
          <h4>Grouped timeline</h4>
          <table>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Count</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <tr key={group.key}>
                  <td>{group.key}</td>
                  <td>{group.values.length}</td>
                  <td>{group.values.at(-1)?.timestamp ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h4>Latest values</h4>
          <ul>
            {sortSignals(input.signals.values, true)
              .slice(0, 20)
              .map((signal) => (
                <li key={signal.id}>
                  {signal.id} · {formatSignal(signal)}
                </li>
              ))}
          </ul>
        </section>
      </div>
    </section>
  );
};
