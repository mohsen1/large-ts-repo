import { memo, useMemo } from 'react';
import type { AnySignalEnvelope, SignalLayer } from '@domain/recovery-cockpit-cognitive-core';
import { useCognitiveCockpitSignals } from '../../hooks/useCognitiveCockpitSignals';

type SignalRow = {
  readonly key: string;
  readonly at: string;
  readonly kind: string;
  readonly layer: SignalLayer;
  readonly severity: string;
};

const severityOrder = ['critical', 'degraded', 'warning', 'notice', 'info'] as const;
type Severity = (typeof severityOrder)[number];

export interface CognitiveSignalGridProps {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly onRefresh?: () => void;
}

const signalCell = ({ key, at, kind, layer, severity }: SignalRow) => (
  <tr key={key}>
    <td>{new Date(at).toLocaleTimeString()}</td>
    <td>{kind}</td>
    <td>{layer}</td>
    <td>{severity}</td>
  </tr>
);

export const CognitiveSignalGrid = memo<CognitiveSignalGridProps>(({ tenantId, workspaceId, onRefresh }) => {
  const { signals, loading, refresh, error, layers } = useCognitiveCockpitSignals({
    tenantId,
    workspaceId,
  });

  const rows: readonly SignalRow[] = useMemo(
    () =>
      signals
        .toSorted((left, right) => right.emittedAt.localeCompare(left.emittedAt))
        .map((signal) => ({
          key: `${signal.id}:${signal.runId}`,
          at: signal.emittedAt,
          kind: signal.kind,
          layer: signal.layer,
          severity: severityOrder.includes(signal.severity as Severity) ? (signal.severity as Severity) : 'notice',
        })),
    [signals],
  );

  const counts = useMemo(
    () =>
      Object.entries(layers).map(([layer, count]) => (
        <li key={layer}>
          {layer}: {count}
        </li>
      )),
    [layers],
  );

  return (
    <section className="cognitive-signal-grid">
      <header>
        <h2>Workspace signals</h2>
        <button
          type="button"
          onClick={() => {
            void refresh();
            onRefresh?.();
          }}
          disabled={loading}
        >
          {loading ? 'Syncing…' : 'Refresh'}
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <ul className="signal-metrics">{counts}</ul>
      <table>
        <thead>
          <tr>
            <th>Emitted</th>
            <th>Kind</th>
            <th>Layer</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>{rows.map(signalCell)}</tbody>
      </table>
    </section>
  );
});
