import { useMemo } from 'react';
import { type OrchestratorOutput } from '@service/recovery-incident-lab-orchestrator';
import { useRecoveryLabOperations } from './useRecoveryLabOperations';

export interface StressLabDiagnostics {
  readonly runHealth: 'missing' | 'ready' | 'warning' | 'failure';
  readonly noteCount: number;
  readonly envelopeCount: number;
  readonly isReadyToLaunch: boolean;
  readonly summary: string;
}

export const useStressLabDiagnostics = (): StressLabDiagnostics => {
  const { state, envelopes, validate, statusText } = useRecoveryLabOperations();
  const runHealth = useMemo<StressLabDiagnostics['runHealth']>(() => {
    if (!state.output) {
      return 'missing';
    }
    const failureCount = state.output.run.results.filter((result) => result.status === 'failed').length;
    return failureCount > 0 ? 'failure' : state.output.run.results.length === 0 ? 'warning' : 'ready';
  }, [state.output]);

  const summary = useMemo(
    () =>
      state.output ? `run=${state.output.run.runId}; envelopes=${state.output.telemetry.length}` : `status=${statusText}`,
    [state.output, statusText],
  );

  return {
    runHealth,
    noteCount: state.logs.length,
    envelopeCount: envelopes.length,
    isReadyToLaunch: validate() === 'valid',
    summary,
  };
};
