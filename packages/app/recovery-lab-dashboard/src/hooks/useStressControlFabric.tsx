import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkRoute } from '@shared/type-level/stress-conditional-union-grid';
import {
  runControlFlowFromDomain,
  type ControlMode,
  type ControlReport,
} from '@domain/recovery-lab-synthetic-orchestration';
import { runControlFlowScenario } from '@domain/recovery-lab-synthetic-orchestration/compiler-control-lab';
import {
  routeCatalog,
  seedCatalog,
} from '@shared/type-level/stress-conditional-union-grid';

type HarnessMode =
  | 'idle'
  | 'prime'
  | 'warm'
  | 'execute'
  | 'throttle'
  | 'fallback'
  | 'escalate'
  | 'drain'
  | 'verify'
  | 'finish';

type UseStressControlFabricProps = {
  readonly seed: WorkRoute;
  readonly count: number;
  readonly domain?: Parameters<typeof runControlFlowFromDomain>[0];
  readonly mode?: HarnessMode;
};

type ControlFabricState = {
  readonly selectedMode: HarnessMode;
  readonly routes: WorkRoute[];
  readonly profiles: ControlReport<WorkRoute>[];
  readonly status: 'idle' | 'running' | 'error' | 'success';
  readonly selectedRoute: WorkRoute;
};

export const useStressControlFabric = ({
  seed,
  count,
  domain = 'recovery',
  mode = 'execute',
}: UseStressControlFabricProps): {
  readonly state: ControlFabricState;
  readonly run: () => Promise<void>;
  readonly setMode: (mode: HarnessMode) => void;
  readonly toggleMode: () => void;
} => {
  const modes: HarnessMode[] = ['idle', 'prime', 'warm', 'execute', 'throttle', 'fallback', 'escalate', 'drain', 'verify', 'finish'];
  const [selectedMode, setSelectedMode] = useState<HarnessMode>(mode);
  const [status, setStatus] = useState<ControlFabricState['status']>('idle');

  const routes = useMemo(() => {
    const fallback = [...seedCatalog] as WorkRoute[];
    const base = [seed, ...(routeCatalog.filter((entry) => entry !== seed) as WorkRoute[])];
    const normalized = [...base, ...fallback].filter(Boolean);
    return normalized.slice(0, Math.max(3, count));
  }, [seed, count]);

  const profiles = useMemo(() => {
    if (routes.length === 0) return [];
    const profile = runControlFlowFromDomain(domain, selectedMode);
    const synthetic = runControlFlowScenario(
      routes,
      selectedMode as ControlMode,
      {
        serviceName: `fabric-${domain}-${mode}`,
        endpoints: routes.map((route) => ({
          path: route,
          method: 'POST',
          payload: {
            mode: selectedMode,
            seed,
            index: route.length,
          },
        })),
      },
    );

    return [profile.profile, synthetic] as ControlReport<WorkRoute>[];
  }, [routes, selectedMode, domain, seed, mode]);

  const run = useCallback(async () => {
    setStatus('running');
    try {
      for (const route of routes) {
        await Promise.resolve(route.toLowerCase());
        const arenaToken = {
          [Symbol.asyncDispose]: async () => {
            await Promise.resolve();
          },
        } as const;
        await arenaToken[Symbol.asyncDispose]();
      }
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [routes]);

  const setMode = useCallback((next: HarnessMode) => {
    setSelectedMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    const index = modes.indexOf(selectedMode);
    const next = modes[(index + 1) % modes.length];
    setSelectedMode(next);
  }, [selectedMode]);

  const selectedRoute = routes[selectedMode.length % routes.length] ?? (seedCatalog[0] as WorkRoute);

  useEffect(() => {
    if (status === 'running') {
      void run();
    }
  }, [status, run]);

  return {
    state: {
      selectedMode,
      routes,
      profiles,
      status,
      selectedRoute,
    },
    run,
    setMode,
    toggleMode,
  };
};
