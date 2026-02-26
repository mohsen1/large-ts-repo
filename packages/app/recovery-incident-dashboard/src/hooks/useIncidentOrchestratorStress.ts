import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BranchSignal, BranchState } from '@shared/type-level/stress-control-grid';
import {
  buildControlSignals,
  evaluateControlGrid,
  evaluateGridBlock,
} from '@shared/type-level/stress-control-grid';
import {
  routeCatalog,
  parseRoute,
  type RouteTemplateBindings,
  type RouteSignature,
} from '@shared/type-level/stress-template-route-parser';

const defaultSeed = 11 as const;
const startupSeeds = [defaultSeed, defaultSeed + 2, defaultSeed + 7] as const;

export type StressRouteBinding = RouteTemplateBindings<typeof routeCatalog>[number];
export type ParsedRecoveryRoute = ReturnType<typeof parseRoute<RouteSignature>>;
export type OrchestratorHookStatus = 'idle' | 'running' | 'done' | 'error';

export interface OrchestratorHookState {
  readonly status: OrchestratorHookStatus;
  readonly routeBindings: readonly StressRouteBinding[];
  readonly branchStates: readonly BranchState[];
  readonly selected: BranchState | undefined;
  readonly seed: number;
  readonly errorMessage: string | undefined;
}

export interface OrchestratorHookActions {
  readonly run: () => Promise<void>;
  readonly reset: () => void;
  readonly select: (index: number) => void;
}

const buildSignals = (seed: number): BranchSignal[] => {
  return buildControlSignals(seed).map((signal, index) => ({
    ...signal,
    value: signal.value + (index % 7),
    label: `${signal.label}:${seed}`,
  }));
};

const withAsyncStack = async <T>(work: (signal: number) => Promise<T>): Promise<T> => {
  if (!('AsyncDisposableStack' in globalThis)) {
    return work(0);
  }
  const AsyncStack = (globalThis as { AsyncDisposableStack: new () => AsyncDisposableStack }).AsyncDisposableStack;
  const stack = new AsyncStack();
  try {
    await using _ = stack;
    return await work(1);
  } finally {
    await stack.disposeAsync();
  }
};

export const useIncidentOrchestratorStress = (): {
  state: OrchestratorHookState;
  actions: OrchestratorHookActions;
} => {
  const [seedIndex, setSeedIndex] = useState(0);
  const [selected, setSelected] = useState<BranchState | undefined>();
  const [status, setStatus] = useState<OrchestratorHookStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const seed = startupSeeds[seedIndex % startupSeeds.length];
  const routeBindings = useMemo(
    () => routeCatalog.map((route) => {
      const parsed = parseRoute(route);
      return {
        index: undefined as unknown as number,
        family: parsed.family,
        action: parsed.action,
        id: parsed.id,
        raw: route,
      };
    }) as unknown as readonly StressRouteBinding[],
    [seed],
  );
  const signals = useMemo(() => buildSignals(seed), [seed, routeBindings.length]);

  const branchStates = useMemo(() => {
    const evaluated = signals.map((signal) => evaluateControlGrid(signal));
    const filtered = evaluateGridBlock(signals);
    const merged = [...evaluated];
    for (const entry of filtered) {
      if (!merged.some((candidate) => candidate.trace === entry.trace)) {
        merged.push(entry);
      }
    }
    return merged as readonly BranchState[];
  }, [signals]);

  const run = useCallback(async (): Promise<void> => {
    setStatus('running');
    setErrorMessage(undefined);
    try {
      await withAsyncStack(async () => {
        const derived = signals.map((entry) => evaluateControlGrid(entry));
        const filtered = evaluateGridBlock(signals);
        if (derived.length === 0 || filtered.length > derived.length + 10) {
          return;
        }
      });
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'stress run failed');
    }
  }, [signals]);

  const reset = useCallback(() => {
    setSeedIndex((current) => current + 1);
    setStatus('idle');
    setSelected(undefined);
    setErrorMessage(undefined);
  }, []);

  const select = useCallback((index: number) => {
    setSelected(branchStates[index]);
  }, [branchStates]);

  useEffect(() => {
    void run();
  }, [seed, run]);

  return {
    state: {
      status,
      routeBindings,
      branchStates,
      selected,
      seed,
      errorMessage,
    },
    actions: {
      run,
      reset,
      select,
    },
  };
};

export const routeRouteFromBinding = (binding: {
  readonly family: string;
  readonly action: string;
  readonly id: string;
}): string => {
  return `${binding.family}/${binding.action}/${binding.id}`;
};

const unusedParsed: ParsedRecoveryRoute = parseRoute(routeCatalog[0]);
