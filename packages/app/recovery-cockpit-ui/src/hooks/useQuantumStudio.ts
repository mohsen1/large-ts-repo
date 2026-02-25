import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  runBatch,
  runQuantumPlan,
  type QuantumRunResultView,
} from '../services/quantumStudioService';
import { type ScenarioSeed } from '@shared/quantum-studio-core';

export type QuantumStudioHookState = {
  readonly isLoading: boolean;
  readonly runs: readonly QuantumRunResultView[];
  readonly latest?: QuantumRunResultView['run'];
  readonly error?: string;
};

export const useQuantumStudio = (scenarioSeed?: ScenarioSeed): QuantumStudioHookState => {
  const [isLoading, setLoading] = useState(false);
  const [runs, setRuns] = useState<readonly QuantumRunResultView[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [latest, setLatest] = useState<QuantumRunResultView['run'] | undefined>(undefined);

  const hydrateSeed = useMemo(() => scenarioSeed, [scenarioSeed]);

  const execute = useCallback(async (seed: ScenarioSeed | undefined): Promise<void> => {
    if (!seed) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await runQuantumPlan(
        {
          mode: 'dry-run',
          tenant: seed.tenant,
          scenario: seed.scenarioId,
        },
        'dry-run',
      );
      setLatest(result.run);
      setRuns((previous) => [result, ...previous].slice(0, 12));
    } catch (thrown: unknown) {
      const message = thrown instanceof Error ? thrown.message : 'Unknown orchestration error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const replayAll = useCallback(async (): Promise<void> => {
    if (!hydrateSeed) {
      return;
    }

    setLoading(true);
    try {
      const result = await runBatch([hydrateSeed], 'dry-run');
      setRuns(result);
    } catch (thrown: unknown) {
      const message = thrown instanceof Error ? thrown.message : 'Batch failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [hydrateSeed]);

  useEffect(() => {
    if (!hydrateSeed) {
      return;
    }
    void execute(hydrateSeed);
    void replayAll();
  }, [hydrateSeed, execute, replayAll]);

  return {
    isLoading,
    runs,
    latest,
    error,
  };
};
