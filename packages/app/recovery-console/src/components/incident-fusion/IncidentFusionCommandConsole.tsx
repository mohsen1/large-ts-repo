import { useMemo } from 'react';
import { useIncidentFusionWorkspace } from '../../hooks/incident-fusion/useIncidentFusionWorkspace';
import { IncidentFusionSignalPanel } from './IncidentFusionSignalPanel';
import { IncidentFusionScenarioMatrix } from './IncidentFusionScenarioMatrix';
import { IncidentFusionPulseChart } from './IncidentFusionPulseChart';

export interface IncidentFusionCommandConsoleProps {
  readonly tenant: string;
  readonly title?: string;
}

export const IncidentFusionCommandConsole = ({ tenant, title = 'Incident Fusion Console' }: IncidentFusionCommandConsoleProps) => {
  const { state, loading, error, reload } = useIncidentFusionWorkspace({ tenant });

  const stateSummary = useMemo(() => {
    const resolved = state.signals.filter((signal) => signal.state === 'resolved').length;
    const aging = state.signals.filter((signal) => signal.state === 'aging').length;
    const fresh = state.signals.filter((signal) => signal.state === 'fresh').length;
    return { resolved, aging, fresh, total: state.signals.length };
  }, [state.signals]);

  return (
    <section style={{ padding: '1rem', border: '1px solid #2f3f55', borderRadius: 12, background: '#081826', color: '#d6e6f2' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button
          type="button"
          onClick={reload}
          style={{ borderRadius: 8, border: '1px solid #5a6f8a', background: '#112740', color: '#d6e6f2' }}
        >
          Refresh workspace
        </button>
      </header>
      {loading ? <p>Loading incident fusion state…</p> : null}
      {error ? <p style={{ color: '#ff8e8e' }}>{error}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <IncidentFusionSignalPanel
          tenant={tenant}
          signals={state.signals}
          scenarios={state.scenarios}
          summary={stateSummary}
        />
        <IncidentFusionScenarioMatrix
          tenant={tenant}
          scenarios={state.scenarios}
          actions={state.actions}
        />
      </div>
      <IncidentFusionPulseChart tenant={tenant} signals={state.signals} />
      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Last sync: {state.lastUpdatedAt ?? 'never'}</p>
    </section>
  );
};
