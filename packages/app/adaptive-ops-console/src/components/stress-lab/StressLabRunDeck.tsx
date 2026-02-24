import { useMemo, useState } from 'react';
import { type SeverityBand } from '@domain/recovery-stress-lab';
import { type RecoverySignal } from '@domain/recovery-stress-lab';
import { type WorkloadTopology } from '@domain/recovery-stress-lab';

interface StressLabRunDeckProps {
  topology: WorkloadTopology;
  signals: readonly RecoverySignal[];
  band: SeverityBand;
  onSubmit: (input: {
    topology: WorkloadTopology;
    signals: readonly RecoverySignal[];
    band: SeverityBand;
    runbookIds: readonly string[];
  }) => void;
}

interface SignalRow {
  readonly id: string;
  readonly label: string;
  readonly severity: string;
}

export const StressLabRunDeck = ({ topology, signals, band, onSubmit }: StressLabRunDeckProps) => {
  const [runbookIdsValue, setRunbookIdsValue] = useState('runbook-1,runbook-2');
  const [selectedBand, setSelectedBand] = useState<SeverityBand>(band);
  const [nodeFilter, setNodeFilter] = useState('');

  const signalRows = useMemo<readonly SignalRow[]>(() => {
    const normalized = signals.filter((signal) => signal.title.includes(nodeFilter) || signal.class.includes(nodeFilter));
    return normalized
      .map((signal) => ({
        id: signal.id,
        label: signal.title,
        severity: signal.severity,
      }))
      .toSorted((left, right) => left.severity.localeCompare(right.severity));
  }, [signals, nodeFilter]);

  const nodeRows = useMemo(() => {
    const filtered = topology.nodes.filter((node) => node.name.includes(nodeFilter));
    return filtered.map((node) => ({
      id: node.id,
      name: node.name,
      active: node.active,
      criticality: node.criticality,
    }));
  }, [topology.nodes, nodeFilter]);

  const onSubmitNow = () => {
    const runbookIds = runbookIdsValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    onSubmit({ topology, signals, band: selectedBand, runbookIds });
  };

  const toNodeLabel = (value: { readonly id: string; readonly criticality: number }) => `${value.id} (${value.criticality})`;

  return (
    <section className="stress-lab-run-deck">
      <h3>Stress Lab Run Deck</h3>
      <label>
        Node filter
        <input value={nodeFilter} onChange={(event) => setNodeFilter(event.target.value)} />
      </label>
      <label>
        Runbook IDs
        <input value={runbookIdsValue} onChange={(event) => setRunbookIdsValue(event.target.value)} />
      </label>
      <label>
        Band
        <select value={selectedBand} onChange={(event) => setSelectedBand(event.target.value as SeverityBand)}>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </label>

      <div className="signal-summary">
        <h4>Signals ({signalRows.length})</h4>
        <ul>
          {signalRows.map((row) => (
            <li key={row.id}>
              <strong>{row.id}</strong>
              <span>{row.label}</span>
              <small>{row.severity}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="topology-summary">
        <h4>Topology Nodes ({nodeRows.length})</h4>
        <ul>
          {nodeRows.map((node) => (
            <li key={node.id}>
              <code>{toNodeLabel(node)}</code>
              <span>{node.active ? 'active' : 'standby'}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="run-controls">
        <button type="button" onClick={onSubmitNow}>
          Run stress orchestration
        </button>
      </div>
    </section>
  );
};
