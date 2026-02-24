import { memo } from 'react';

import type { FusionLabPageState } from '../types';

const progressColor = (score: number): string => {
  if (score >= 0.75) {
    return '#22c55e';
  }
  if (score >= 0.45) {
    return '#f59e0b';
  }
  return '#ef4444';
}

export const FusionLabPolicyPanel = memo(function FusionLabPolicyPanel({ state }: { state: FusionLabPageState }) {
  return (
    <section>
      <h3>Policy Health</h3>
      <div>
        <p>Workspace: {state.workspace}</p>
        <p>Wave count: {state.waveCount}</p>
        <p>Signal count: {state.signalCount}</p>
        <p>Command count: {state.commandCount}</p>
        <p>Health score: {state.healthScore.toFixed(2)}</p>
      </div>
      <meter
        min={0}
        max={100}
        value={state.healthScore}
        style={{ width: '100%', accentColor: progressColor(state.healthScore) }}
      />
      {state.loading && <strong>Running... </strong>}
      {state.errorMessage && <p style={{ color: '#ef4444' }}>{state.errorMessage}</p>}
    </section>
  );
});
