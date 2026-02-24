import { useCallback, useEffect, useState } from 'react';
import type { LabExecutionResult } from '@domain/recovery-simulation-lab-core';
import { MemoryRecoveryLabStore } from '@data/recovery-lab-simulation-store';
import { RecoveryLabRuntime } from '@service/recovery-lab-orchestrator';
import type { NoInfer } from '@shared/type-level';

const store = new MemoryRecoveryLabStore();
const runtime = new RecoveryLabRuntime(store, []);

type LabLane = 'simulate' | 'verify' | 'restore';

interface UseLabRunnerParams {
  readonly tenant: string;
  readonly scenarioId: string;
}

interface UseLabRunnerState {
  readonly running: boolean;
  readonly result: LabExecutionResult | null;
  readonly history: readonly string[];
  readonly start: (lane: NoInfer<LabLane>) => void;
}

export const useLabRunner = ({ tenant, scenarioId }: UseLabRunnerParams): UseLabRunnerState => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LabExecutionResult | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);

  const start = useCallback((lane: NoInfer<LabLane>) => {
    setRunning(true);
    setHistory((previous) => [...previous, `${lane}::${scenarioId}:starting`]);
    void (async () => {
      try {
        const outcome = await runtime.run(tenant, scenarioId, lane);
        setResult(outcome);
        setHistory((previous) => [...previous, `${outcome.status}:${scenarioId}`]);
      } finally {
        setRunning(false);
      }
    })();
  }, [tenant, scenarioId]);

  useEffect(() => {
    if (!tenant || !scenarioId) {
      setResult(null);
      return;
    }
  }, [tenant, scenarioId]);

  return {
    running,
    result,
    history,
    start,
  };
};
