import { useCallback, useMemo, useState } from 'react';
import { LatticeCommandGraph, LatticeSignalBars, LatticeSignalPills } from '../components/LatticeCommandGraph';
import { LatticePolicySignals } from '../components/LatticePolicySignals';
import { LatticeSignalStream } from '../components/LatticeSignalStream';
import { useLatticeCommandOrchestrator } from '../hooks/useLatticeCommandOrchestrator';
import type { LatticeMode } from '../services/latticeOrchestrationService';

const availableModes: readonly LatticeMode[] = ['analysis', 'simulation', 'stress', 'drill'];

interface MetricTile {
  readonly label: string;
  readonly value: string;
  readonly description: string;
}

const buildModeLabel = (mode: LatticeMode): `${LatticeMode}-mode` => `${mode}-mode`;

export const LatticeControlRoomPage = () => {
  const [mode, setMode] = useState<LatticeMode>('analysis');
  const tenant = 'tenant://lattice-control';
  const streamId = 'stream://recovery-lattice-control';
  const namespace = 'namespace://control-room';

  const { state, events, metrics, run, load, executeAndLoad } = useLatticeCommandOrchestrator({
    tenant,
    streamId,
    namespace,
  });

  const onRun = useCallback(() => {
    void run(mode);
  }, [mode, run]);

  const onRunAndLoad = useCallback(() => {
    void executeAndLoad(mode);
  }, [executeAndLoad, mode]);

  const onMode = useCallback((next: LatticeMode) => {
    setMode((current: LatticeMode) => (current === next ? current : next));
  }, []);

  const modeLabel = useMemo(() => buildModeLabel(mode), [mode]);

  const summary: readonly MetricTile[] = useMemo(
    () => [
      {
        label: 'Accepted',
        value: `${state.accepted}`,
        description: 'Accepted events',
      },
      {
        label: 'Rejected',
        value: `${state.rejected}`,
        description: 'Rejected events',
      },
      {
        label: 'Risk',
        value: `${metrics.risk.toFixed(3)}`,
        description: 'Average signal score',
      },
      {
        label: 'Acceptance',
        value: `${(metrics.acceptanceRate * 100).toFixed(1)}%`,
        description: 'Acceptance rate',
      },
      {
        label: 'Critical',
        value: `${metrics.hasCritical ? 'yes' : 'no'}`,
        description: 'Contains critical levels',
      },
    ],
    [state.accepted, state.rejected, metrics.acceptanceRate, metrics.hasCritical, metrics.risk],
  );

  const graphMetrics = useMemo(
    () => [
      {
        id: 'acceptance',
        label: 'Acceptance',
        value: metrics.acceptanceRate,
      },
      {
        id: 'alerts',
        label: 'Alerts',
        value: metrics.alertDensity > 0 ? Math.min(1, metrics.alertDensity / 20) : 0,
      },
      {
        id: 'risk',
        label: 'Risk',
        value: metrics.risk,
      },
      {
        id: 'alertDensity',
        label: 'Alert Density',
        value: state.lastAlertCount > 0 ? Math.min(1, state.lastAlertCount / 100) : 0,
      },
    ],
    [metrics.alertDensity, metrics.risk, metrics.acceptanceRate, state.lastAlertCount],
  );

  return (
    <main>
      <header>
        <h1>Lattice Control Room</h1>
        <p>Tenant: {tenant}</p>
        <p>Mode label: {modeLabel}</p>
      </header>
      <section>
        <p>Report: {state.report || 'No report yet'}</p>
        <p>Run ID: {state.lastRunId || 'none'}</p>
        <p>Alert density: {metrics.alertDensity}</p>
      </section>
      <section>
        {availableModes.map((entry) => (
          <button
            type="button"
            key={entry}
            onClick={() => onMode(entry)}
            style={{
              marginRight: 8,
              fontWeight: mode === entry ? 'bold' : 'normal',
            }}
          >
            {entry}
          </button>
        ))}
      </section>
      <section>
        <button type="button" onClick={onRun}>Run</button>
        <button type="button" onClick={() => void load()} style={{ marginLeft: 8 }}>Load</button>
        <button type="button" onClick={onRunAndLoad} style={{ marginLeft: 8 }}>Run+Load</button>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {summary.map((tile) => (
          <article key={tile.label} style={{ border: '1px solid #e5e7eb', padding: 12 }}>
            <h3>{tile.label}</h3>
            <p>{tile.value}</p>
            <small>{tile.description}</small>
          </article>
        ))}
      </section>
      <LatticeCommandGraph title="Lattice Signal Control" metrics={graphMetrics} streamId={streamId}>
        <LatticeSignalBars events={events} />
        <LatticeSignalPills events={events} />
      </LatticeCommandGraph>
      <LatticePolicySignals signals={events} onRefresh={() => void load()} />
      <LatticeSignalStream streamId={streamId} events={events} enabled={state.hasData} />
    </main>
  );
};
