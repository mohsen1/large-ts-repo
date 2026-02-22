import { useMemo } from 'react';

import type { SimulationSummary } from '@domain/recovery-simulation-planning';
import type { RunDiagnostics } from '@service/recovery-runner';

interface RecoveryOperationsControlPanelProps {
  readonly summary?: SimulationSummary;
  readonly diagnostics?: RunDiagnostics;
  readonly running: boolean;
  readonly onRun: () => void;
  readonly onReset: () => void;
}

export const RecoveryOperationsControlPanel = ({
  summary,
  diagnostics,
  running,
  onRun,
  onReset,
}: RecoveryOperationsControlPanelProps) => {
  const healthState = useMemo(() => {
    if (!diagnostics) return 'idle';
    if (diagnostics.health.score < 40) return 'degraded';
    if (diagnostics.health.score > 75) return 'healthy';
    return 'warn';
  }, [diagnostics]);

  return (
    <section className="control-panel">
      <h3>Recovery operations control panel</h3>
      <p>Status: {running ? 'running' : 'ready'}</p>
      <p>Health: {healthState}</p>
      {summary && <p>Score: {summary.score}</p>}
      <p>Readiness: {summary?.readinessState ?? 'idle'}</p>
      <div>
        <button type="button" onClick={onRun} disabled={running}>
          Run workspace simulation
        </button>
        <button type="button" onClick={onReset}>
          Clear
        </button>
      </div>
    </section>
  );
};
