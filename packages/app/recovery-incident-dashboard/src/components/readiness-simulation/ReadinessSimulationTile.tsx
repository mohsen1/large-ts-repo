import { useMemo } from 'react';
import type { ReadinessSimulationState } from '../../types/readinessSimulationConsole';

export interface ReadinessSimulationTileProps {
  readonly state: ReadinessSimulationState;
}

export const ReadinessSimulationTile = ({ state }: ReadinessSimulationTileProps) => {
  const risk = useMemo(() => {
    const severe = state.projection.reduce((sum, sample) => sum + (sample.weightedSeverity > 4 ? sample.signals : 0), 0);
    return severe > 6 ? 'high' : severe > 3 ? 'medium' : 'low';
  }, [state.projection]);

  const totalSignals = useMemo(() => state.projection.reduce((sum, sample) => sum + sample.signals, 0), [state.projection]);

  return (
    <section className={`readiness-simulation-tile risk-${risk}`}>
      <header>
        <h2>{state.tenant}</h2>
        <p>{state.runId}</p>
      </header>
      <dl>
        <div>
          <dt>Signals</dt>
          <dd>{totalSignals}</dd>
        </div>
        <div>
          <dt>Signals/Minute</dt>
          <dd>{state.projection.length}</dd>
        </div>
        <div>
          <dt>Nodes</dt>
          <dd>{state.nodes.length}</dd>
        </div>
      </dl>
      <footer>
        <p>Status: {state.active ? 'running' : 'idle'}</p>
        <p>{state.note}</p>
      </footer>
    </section>
  );
};
