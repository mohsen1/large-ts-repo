import { type FC } from 'react';

export interface GraphControlToolbarProps {
  readonly selectedMode: 'graph' | 'timeline' | 'diagnostics';
  readonly onModeChange: (mode: 'graph' | 'timeline' | 'diagnostics') => void;
  readonly canRun: boolean;
  readonly onRun: () => void;
  readonly onReset: () => void;
}

export const GraphControlToolbar: FC<GraphControlToolbarProps> = ({
  selectedMode,
  onModeChange,
  canRun,
  onRun,
  onReset,
}) => {
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
      <button type="button" onClick={onRun} disabled={!canRun}>
        Run orchestration
      </button>
      <button type="button" onClick={onReset}>
        Reset
      </button>
      <button
        type="button"
        onClick={() => onModeChange('graph')}
        style={{ background: selectedMode === 'graph' ? '#123' : '#111' }}
      >
        Graph
      </button>
      <button
        type="button"
        onClick={() => onModeChange('timeline')}
        style={{ background: selectedMode === 'timeline' ? '#123' : '#111' }}
      >
        Timeline
      </button>
      <button
        type="button"
        onClick={() => onModeChange('diagnostics')}
        style={{ background: selectedMode === 'diagnostics' ? '#123' : '#111' }}
      >
        Diagnostics
      </button>
    </div>
  );
};
