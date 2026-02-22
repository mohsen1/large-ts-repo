import { useCallback, useMemo, useState } from 'react';
import type { StabilityRunId } from '@domain/recovery-stability-models';
import { StabilityOrchestratorService } from '@service/recovery-stability-orchestrator';

export interface StabilityCommand {
  readonly runId: StabilityRunId;
  readonly command: string;
  readonly params?: Record<string, string | number | boolean>;
}

export interface StabilityCommandState {
  readonly pending: boolean;
  readonly lastCommand?: StabilityCommand;
}

export const useStabilityCommands = (orchestrator: StabilityOrchestratorService) => {
  const [state, setState] = useState<StabilityCommandState>({ pending: false });

  const runPreview = useCallback(async (runId: StabilityRunId) => {
    setState({ pending: true, lastCommand: { runId, command: 'preview' } });
    const result = await orchestrator.evaluateReadiness(runId);
    setState({ pending: false, lastCommand: { runId, command: 'preview' } });
    if (!result.ok) {
      throw new Error('readiness preview failed');
    }
    return result.value;
  }, [orchestrator]);

  const runPublish = useCallback(async (runId: StabilityRunId) => {
    setState({ pending: true, lastCommand: { runId, command: 'publish', params: { priority: 1 } } });
    const result = await orchestrator.summarizeRun(runId);
    setState({ pending: false, lastCommand: { runId, command: 'publish', params: { priority: 1 } } });
    if (!result.ok) {
      throw new Error('run publish failed');
    }
    return result.value;
  }, [orchestrator]);

  const availableCommands = useMemo(
    () => [
      { command: 'drain-traffic', enabled: true },
      { command: 'snapshot-state', enabled: true },
      { command: 'rollback-test', enabled: false },
    ],
    [],
  );

  return {
    state,
    runPreview,
    runPublish,
    availableCommands,
  };
};
