import { useCallback, useEffect, useMemo, useState } from 'react';
import { runStudioScenario } from '../services/studioConsoleService';

interface UseSignalStudioParams {
  readonly tenant: string;
  readonly workspace: string;
}

interface StudioWorkspace {
  readonly scenario: string;
  readonly traces: readonly string[];
  readonly running: boolean;
}

interface UseSignalStudioReturn {
  readonly loading: boolean;
  readonly error: string | null;
  readonly selectedScenario: string;
  readonly scenarioNames: readonly string[];
  readonly workspace: StudioWorkspace;
  readonly run: () => Promise<void>;
  readonly setScenario: (scenario: string) => void;
}

const defaultScenarios = ['signal-lane-a', 'signal-lane-b', 'signal-lane-c', 'signal-lane-d'];

export const useSignalStudio = ({ tenant, workspace }: UseSignalStudioParams): UseSignalStudioReturn => {
  const [selectedScenario, setSelectedScenario] = useState(defaultScenarios[0]);
  const [workspaceState, setWorkspaceState] = useState<StudioWorkspace>({
    scenario: defaultScenarios[0],
    traces: [],
    running: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenarioNames = useMemo(() => defaultScenarios, []);

  const run = useCallback(async () => {
    setLoading(true);
    setWorkspaceState((state) => ({ ...state, running: true }));
    setError(null);

    try {
      const result = await runStudioScenario(tenant, workspace, selectedScenario);
      setWorkspaceState({
        scenario: selectedScenario,
        traces: result.traces,
        running: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'studio error');
      setWorkspaceState((state) => ({ ...state, running: false }));
    } finally {
      setLoading(false);
    }
  }, [tenant, workspace, selectedScenario]);

  useEffect(() => {
    void run();
  }, []);

  return {
    loading,
    error,
    selectedScenario,
    scenarioNames,
    workspace: workspaceState,
    run,
    setScenario: setSelectedScenario,
  };
};

export interface StudioBatch {
  readonly batchId: string;
  readonly traces: readonly string[];
  readonly success: number;
  readonly failed: number;
}

export const useStudioBatchRunner = (): StudioBatch => {
  return {
    batchId: 'batch-studio',
    traces: ['seed'],
    success: 0,
    failed: 0,
  };
};
