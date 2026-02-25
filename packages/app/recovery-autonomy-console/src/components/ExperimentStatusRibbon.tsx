import type { OrchestrationResult } from '@service/recovery-autonomy-experiment-orchestrator';

const palette = {
  idle: 'rgba(59, 130, 246, 0.14)',
  complete: 'rgba(34, 197, 94, 0.14)',
  failed: 'rgba(239, 68, 68, 0.14)',
  running: 'rgba(14, 165, 233, 0.14)',
} as const;

interface Props {
  readonly result?: OrchestrationResult;
}

const toLabel = (result?: OrchestrationResult): string => {
  if (!result) {
    return 'idle';
  }
  if (result.ok) {
    return result.state.completed ? 'complete' : 'running';
  }
  return 'failed';
};

export const ExperimentStatusRibbon = ({ result }: Props) => {
  const state = toLabel(result);
  return (
    <div
      style={{
        width: 'fit-content',
        borderRadius: 999,
        padding: '8px 14px',
        background: palette[state as keyof typeof palette],
      }}
    >
      <strong>Experiment state:</strong> {state}
      {result ? ` · outputs ${result.outputs.length}` : ''}
      {result?.error ? <span style={{ marginLeft: 8, color: '#b91c1c' }}> · {result.error.message}</span> : null}
    </div>
  );
};
