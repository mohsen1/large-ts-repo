import { useMemo } from 'react';
import { useStudioConductor } from '../hooks/useStudioConductor';
import { type PluginEvent } from '@shared/cockpit-studio-core';

const rankByStage = (events: readonly PluginEvent[]): Record<string, number> => {
  const accumulator: Record<string, number> = {};
  for (const event of events) {
    accumulator[event.kind] = (accumulator[event.kind] ?? 0) + 1;
  }
  return accumulator;
};

const scoreSeries = (runs: readonly number[]): readonly number[] =>
  runs
    .map((value, index) => {
      const next = value + index * 0.1;
      const bounded = Math.min(100, Math.max(0, Math.round(next * 100) / 100));
      return bounded;
    })
    .toSorted((left, right) => right - left);

export const RecoveryCockpitStudioRuntimeDiagnosticsPage = () => {
  const { runHistory, ready, bootstrap, events } = useStudioConductor();
  const latest = runHistory.at(-1);
  const timelineEvents = latest?.events ?? [];
  const eventCounts = useMemo(() => rankByStage(timelineEvents), [timelineEvents]);
  const historyScores = useMemo(
    () => runHistory.map((entry) => Number(entry.result?.score ?? 0)).toSorted((left, right) => left - right),
    [runHistory],
  );

  return (
    <main style={{ padding: 18 }}>
      <header>
        <h2>Runtime diagnostics</h2>
        <button onClick={() => void bootstrap()} type="button">
          Initialize
        </button>
      </header>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <article style={{ border: '1px solid #e2e8f0', padding: 12, borderRadius: 8 }}>
          <h3>Status</h3>
          <p>Ready: {ready ? 'yes' : 'no'}</p>
          <p>Total events: {events}</p>
          <p>Runs: {runHistory.length}</p>
        </article>
        <article style={{ border: '1px solid #e2e8f0', padding: 12, borderRadius: 8 }}>
          <h3>Event distribution</h3>
          <pre>{JSON.stringify(eventCounts, null, 2)}</pre>
        </article>
      </section>

      <section style={{ border: '1px solid #e2e8f0', padding: 12, borderRadius: 8, marginTop: 12 }}>
        <h3>Score trend</h3>
        <pre>{JSON.stringify(scoreSeries(historyScores), null, 2)}</pre>
      </section>

      <section style={{ marginTop: 12 }}>
        <h3>Latest payload snapshot</h3>
        <pre style={{ maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(latest?.result?.data ?? {}, null, 2)}</pre>
      </section>
    </main>
  );
};
