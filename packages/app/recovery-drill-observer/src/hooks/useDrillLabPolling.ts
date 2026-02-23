import { useCallback, useEffect, useRef, useState } from 'react';
import { createRepository } from '@data/recovery-drill-lab-store';
import { createOrchestrator } from '@service/recovery-drill-lab-orchestrator';
import type { DrillScenarioId, DrillWorkspaceId, DrillRunSnapshot } from '@domain/recovery-drill-lab';

export interface PollingState {
  readonly isActive: boolean;
  readonly ticks: number;
  readonly latest: DrillRunSnapshot | undefined;
  readonly lastError: string | undefined;
  readonly start: () => void;
  readonly stop: () => void;
}

export const useDrillLabPolling = (workspaceId: DrillWorkspaceId, scenarioId: DrillScenarioId): PollingState => {
  const [isActive, setIsActive] = useState(false);
  const [ticks, setTicks] = useState(0);
  const [latest, setLatest] = useState<DrillRunSnapshot | undefined>(undefined);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const handle = useRef<number | undefined>(undefined);

  const repository = useRef(createRepository()).current;
  const orchestrator = useRef(createOrchestrator(repository));

  const stop = useCallback(() => {
    setIsActive(false);
    if (handle.current !== undefined) {
      window.clearTimeout(handle.current);
      handle.current = undefined;
    }
  }, []);

  const runLoop = useCallback(async () => {
    if (!isActive) {
      return;
    }

    const result = await orchestrator.current.run({ tenant: 'polling', workspaceId, scenarioId });
    if (result.ok) {
      setLatest(result.value.snapshot);
      setLastError(undefined);
      setTicks((value) => value + 1);
      handle.current = window.setTimeout(runLoop, 220);
      return;
    }

    setLastError(result.error.message);
    setIsActive(false);
  }, [isActive, scenarioId, workspaceId]);

  const start = useCallback(() => {
    if (isActive) {
      return;
    }
    setIsActive(true);
    handle.current = window.setTimeout(runLoop, 5);
  }, [isActive, runLoop]);

  useEffect(() => {
    return () => {
      if (handle.current !== undefined) {
        window.clearTimeout(handle.current);
      }
    };
  }, []);

  return {
    isActive,
    ticks,
    latest,
    lastError,
    start,
    stop,
  };
};
