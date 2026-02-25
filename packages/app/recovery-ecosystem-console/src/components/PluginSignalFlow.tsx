import { useMemo } from 'react';
import type { ReactElement } from 'react';
import type { PluginRunResult } from '@domain/recovery-ecosystem-analytics';

interface FlowPoint {
  readonly plugin: string;
  readonly status: string;
  readonly latency: number;
}

export const PluginSignalFlow = ({
  results,
  onPrune,
}: {
  readonly results: readonly PluginRunResult[];
  readonly onPrune: (plugin: string) => void;
}): ReactElement => {
  const ordered = useMemo(
    () => results.toSorted((left, right) => left.diagnostics.length - right.diagnostics.length),
    [results],
  );
  return (
    <section>
      <h3>Signal Flow</h3>
      <ol>
        {ordered.length === 0 ? (
          <li>No data yet</li>
        ) : (
          ordered.map((entry) => {
            const totalLatency = entry.diagnostics.reduce((acc, item) => acc + item.latencyMs, 0);
            const point: FlowPoint = {
              plugin: entry.plugin,
              status: entry.accepted ? 'accepted' : 'rejected',
              latency: totalLatency,
            };
            return (
              <li key={entry.plugin}>
                <span>
                  {point.plugin}
                </span>
                <span> — </span>
                <strong>{point.status}</strong>
                <span> latency={point.latency}ms</span>
                <button type="button" onClick={() => onPrune(point.plugin)} style={{ marginLeft: 8 }}>
                  prune
                </button>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
};
