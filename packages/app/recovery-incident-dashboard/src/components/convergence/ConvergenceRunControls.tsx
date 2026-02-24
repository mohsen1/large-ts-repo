import { memo } from 'react';

interface ConvergenceRunControlsProps {
  readonly status: 'idle' | 'loading' | 'running' | 'complete' | 'error';
  readonly onRun: () => void;
  readonly onReset: () => void;
}

const buttonText = (status: ConvergenceRunControlsProps['status']) => {
  switch (status) {
    case 'running':
      return 'Running...';
    case 'loading':
      return 'Loading workspace';
    case 'error':
      return 'Retry run';
    case 'complete':
      return 'Re-run';
    default:
      return 'Run simulation';
  }
};

const canReset = (status: ConvergenceRunControlsProps['status']) => status !== 'loading';

export const ConvergenceRunControls = memo<ConvergenceRunControlsProps>(({ status, onRun, onReset }) => {
  return (
    <section style={{ display: 'flex', gap: 12 }}>
      <button type="button" onClick={onRun} disabled={status === 'running' || status === 'loading'}>
        {buttonText(status)}
      </button>
      <button type="button" onClick={onReset} disabled={!canReset(status)}>
        Reset
      </button>
    </section>
  );
});

ConvergenceRunControls.displayName = 'ConvergenceRunControls';
