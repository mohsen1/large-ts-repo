import { useMemo } from 'react';
import type { OrchestrationRunId } from '@service/recovery-synthesis-orchestrator';

export interface QuantumSynthesisControlPanelProps {
  readonly loading: boolean;
  readonly runId: OrchestrationRunId | undefined;
  readonly mode: 'plan' | 'simulate' | 'review';
  readonly onRun: () => void;
  readonly onSimulate: () => void;
  readonly onApprove: () => void;
  readonly onReset: () => void;
}

export const QuantumSynthesisControlPanel = ({
  loading,
  runId,
  mode,
  onRun,
  onSimulate,
  onApprove,
  onReset,
}: QuantumSynthesisControlPanelProps) => {
  const canRun = !loading;
  const canSimulate = runId !== undefined && !loading;
  const canApprove = mode === 'review' && runId !== undefined && !loading;
  const summary = useMemo(
    () => ({
      runId: runId ?? 'n/a',
      mode,
      canApprove,
    }),
    [runId, mode, canApprove],
  );

  return (
    <section style={{ border: '1px solid #d0d0d0', borderRadius: 12, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <h3>Quantum Synthesis Control</h3>
        <span style={{ opacity: 0.7 }}>{summary.runId}</span>
      </header>
      <p style={{ opacity: 0.75 }}>
        mode: <strong>{summary.mode}</strong> · canApprove: <strong>{String(summary.canApprove)}</strong>
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onRun} disabled={!canRun}>
          Start orchestration
        </button>
        <button type="button" onClick={onSimulate} disabled={!canSimulate}>
          Simulate
        </button>
        <button type="button" onClick={onApprove} disabled={!canApprove}>
          Approve & Dispatch
        </button>
        <button type="button" onClick={onReset} disabled={loading}>
          Reset
        </button>
      </div>
    </section>
  );
};
