import type { FabricCadenceWorkspaceUiState } from '../types';

type FabricCadenceSignalsPanelProps = {
  readonly state: FabricCadenceWorkspaceUiState;
};

export const FabricCadenceSignalsPanel = ({ state }: FabricCadenceSignalsPanelProps) => {
  const intentSignals = state.activeIntent?.acceptedSignals ?? [];
  const blockedSignals = state.activeIntent?.blockedSignals ?? [];

  return (
    <section style={{ padding: 12, border: '1px solid #243248', borderRadius: 12 }}>
      <h3 style={{ margin: '0 0 8px 0' }}>Signals</h3>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <article style={{ padding: 8, border: '1px solid #1f2b3f', borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Accepted</h4>
          <ol>
            {intentSignals.length === 0 ? <li>none</li> : intentSignals.map((signal) => <li key={signal}>{signal}</li>)}
          </ol>
        </article>
        <article style={{ padding: 8, border: '1px solid #1f2b3f', borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Blocked</h4>
          <ol>
            {blockedSignals.length === 0 ? <li>none</li> : blockedSignals.map((signal) => <li key={signal}>{signal}</li>)}
          </ol>
        </article>
      </div>

      <article style={{ marginTop: 10, padding: 10, border: '1px solid #1f2b3f', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 6px 0' }}>Intent</h4>
        <p>{state.activeIntent?.description ?? 'No intent loaded yet.'}</p>
      </article>

      <article style={{ marginTop: 8, padding: 10, border: '1px solid #1f2b3f', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 6px 0' }}>Run Health</h4>
        <p>{state.health?.riskBand ? `band=${state.health.riskBand}` : 'unknown'}</p>
        <p>{state.health?.overloadedNodes?.length ? `overloaded=${state.health.overloadedNodes.length}` : 'no overloaded nodes'}</p>
      </article>
    </section>
  );
};
