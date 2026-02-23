import { useCallback, useEffect, useMemo, useState } from 'react';

import { RecoveryCommandStudioOrchestrator } from '@domain/recovery-command-studio';
import { buildAllocation } from '@domain/recovery-command-studio';
import {
  type StudioCommandBoardRow,
  summarizeSequence,
  toBoardRows,
} from '../services/commandStudioAdapter';
import type { CommandSimulation, StudioRuntimeState } from '@domain/recovery-command-studio';

export interface RecoveryCommandStudioState {
  readonly loading: boolean;
  readonly workspaceId: string;
  readonly boardRows: readonly StudioCommandBoardRow[];
  readonly timeline: readonly CommandSimulation['steps'][number][];
  readonly laneUtilization: number;
  readonly lastError: string | undefined;
}

export interface RecoveryCommandStudioActions {
  readonly load: (rawState: unknown) => void;
  readonly bootstrap: () => Promise<void>;
  readonly refresh: () => void;
}

interface UseRecoveryCommandStudioOptions {
  readonly workspaceId: string;
  readonly seedState: StudioRuntimeState | undefined;
}

export const useRecoveryCommandStudio = ({ workspaceId, seedState }: UseRecoveryCommandStudioOptions): RecoveryCommandStudioState & RecoveryCommandStudioActions => {
  const [orchestrator] = useState(() => new RecoveryCommandStudioOrchestrator(seedState));
  const [state, setState] = useState<StudioRuntimeState>(() => seedState ?? {
    sequences: [],
    runs: [],
    simulations: [],
    metrics: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | undefined>(undefined);

  const hydrate = useCallback((rawState: unknown) => {
    try {
      orchestrator.hydrate({ rawState });
      setState(orchestrator.getState());
      setLastError(undefined);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Unable to hydrate state');
    }
  }, [orchestrator]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    const rows = toBoardRows(state);
    if (rows.length === 0) {
      setLastError('No rows in studio state to bootstrap');
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [state]);

  const refresh = useCallback(() => {
    setState(orchestrator.getState());
    setLastError(undefined);
  }, [orchestrator]);

  useEffect(() => {
    const summary = summarizeSequence(workspaceId, state, state.sequences);
    if (summary.totalRuns === 0) {
      setLoading(false);
    }
  }, [workspaceId, state]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (seedState) {
      orchestrator.hydrate({ rawState: seedState });
      setState(orchestrator.getState());
    }
  }, [seedState, orchestrator]);

  const boardRows = useMemo(() => toBoardRows(state), [state]);
  const timeline = useMemo(() => state.simulations.flatMap((entry) => entry.steps), [state.simulations]);

  const laneUtilization = useMemo(() => {
    const sequence = state.sequences[0];
    if (!sequence) {
      return 0;
    }

    const allocation = buildAllocation(sequence, state.metrics);
    return allocation.utilization;
  }, [state]);

  return {
    loading,
    workspaceId,
    boardRows,
    timeline,
    laneUtilization,
    lastError,
    load: hydrate,
    bootstrap,
    refresh,
  };
};
