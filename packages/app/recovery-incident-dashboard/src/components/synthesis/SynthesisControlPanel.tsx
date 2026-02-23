import type { SynthesisAction, SynthesisPanelState, SynthesisPanelMode } from '../../types/synthesis';

interface SynthesisControlPanelProps {
  readonly state: SynthesisPanelState;
  readonly actions: readonly SynthesisAction[];
  readonly onModeChange: (mode: SynthesisPanelMode) => void;
  readonly onRefresh: () => void;
}

export const SynthesisControlPanel = ({ state, actions, onModeChange, onRefresh }: SynthesisControlPanelProps) => {
  const modeLabel = state.mode === 'plan' ? 'Plan' : state.mode === 'simulate' ? 'Simulate' : 'Review';
  const statusSummary = state.loading ? 'working...' : state.envelope ? 'ready' : 'idle';

  return (
    <section className="synthesis-control-panel">
      <header>
        <h2>Synthesis Control</h2>
        <p>
          Mode: <strong>{modeLabel}</strong> • Status: <strong>{statusSummary}</strong>
        </p>
        {state.error ? <p style={{ color: 'crimson' }}>{state.error}</p> : null}
      </header>

      <div className="mode-controls" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onModeChange('plan')}>
          Plan mode
        </button>
        <button type="button" onClick={() => onModeChange('simulate')}>
          Simulate mode
        </button>
        <button type="button" onClick={() => onModeChange('review')}>
          Review mode
        </button>
      </div>

      <div className="plan-actions" style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
        {actions.map((action) => (
          <button key={action.name} type="button" disabled={action.disabled}>
            {action.name}
          </button>
        ))}
        <button type="button" onClick={onRefresh}>
          Refresh workspace
        </button>
      </div>

      <p style={{ marginTop: '0.75rem' }}>{state.error ?? actions[0]?.description}</p>
    </section>
  );
};
