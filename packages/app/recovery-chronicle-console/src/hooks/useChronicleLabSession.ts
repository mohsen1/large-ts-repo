import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  asChronicleRoute,
  asChronicleTenantId,
  type ChronicleRoute,
  type ChronicleStatus,
  type ChroniclePluginDescriptor,
} from '@shared/chronicle-orchestration-protocol';
import {
  simulateSession,
  simulateAndRender,
  simulateWithPluginOrder,
  type SimulationInput,
  type SimulationOutput,
} from '@domain/recovery-chronicle-lab-core';
import { useChronicleLabCatalog } from './useChronicleLabCatalog';

export interface UseChronicleLabSessionResult {
  readonly route: ChronicleRoute;
  readonly status: ChronicleStatus;
  readonly score: number;
  readonly events: readonly string[];
  readonly running: boolean;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly reset: () => void;
  readonly labels: readonly string[];
}

const initial = {
  status: 'idle' as ChronicleStatus,
  score: 0,
};

export const useChronicleLabSession = (
  tenant: string,
  routeText: string,
  plugins: readonly ChroniclePluginDescriptor[],
): UseChronicleLabSessionResult => {
  const route = asChronicleRoute(routeText);
  const catalog = useChronicleLabCatalog(tenant, plugins);

  const [status, setStatus] = useState<ChronicleStatus>(initial.status);
  const [score, setScore] = useState(initial.score);
  const [events, setEvents] = useState<readonly string[]>([]);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const simulationInput = useMemo<SimulationInput>(
    () => ({
      tenant: asChronicleTenantId(tenant),
      route,
      goal: {
        kind: 'maximize-coverage',
        target: 88,
      },
      limit: 5,
    }),
    [route, tenant],
  );

  const stop = useCallback(() => {
    runningRef.current = false;
  }, []);

  const start = useCallback(async () => {
    runningRef.current = true;
    setSimulationError(null);
    setStatus('running');
    setEvents([]);

    const lines = await simulateAndRender(simulationInput, plugins);
    if (!runningRef.current) {
      setStatus('degraded');
      return;
    }

    const output = await simulateWithPluginOrder(simulationInput, [...plugins].reverse());
    if (!runningRef.current) {
      setStatus('degraded');
      return;
    }

    setStatus(output.status);
    setEvents(lines.toSorted((a, b) => b.localeCompare(a)));
    setScore(output.metrics['metric:score']);
    void output.events;
  }, [plugins, simulationInput]);

  const reset = useCallback(() => {
    runningRef.current = false;
    setEvents([]);
    setStatus(initial.status);
    setScore(initial.score);
    setSimulationError(null);
  }, []);

  useEffect(() => {
    if (status === 'running') {
      void (async () => {
        const snapshot = await simulateSession(simulationInput, plugins);
        setStatus(snapshot.status);
        setScore(snapshot.metrics['metric:score']);
      })();
    }
  }, [plugins, route, status, simulationInput]);

  return {
    route,
    status,
    score,
    events,
    running: status === 'running',
    start,
    stop,
    reset,
    labels: catalog.labels,
  };
};
