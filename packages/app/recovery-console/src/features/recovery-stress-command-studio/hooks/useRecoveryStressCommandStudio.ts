import { useCallback, useMemo, useState } from 'react';
import type {
  StressCommandMode,
  RouteCommand,
  StressStudioBuckets,
  StressStudioRuntimeState,
  StressStudioResult,
} from '../types';
import {
  buildStudioCommands,
  commandWorkspaceState,
  dispatchBucketsFromCommands,
  executeStudioPayload,
  nextStudioMode,
} from '../services/stress-command-studio-engine';

const resolveSeed = (tenant: string, mode: StressCommandMode) =>
  `${tenant}-${mode}-${String(Math.round(Date.now() / 1000)).slice(-6)}`;

export type StressStudioHook = {
  readonly state: StressStudioRuntimeState;
  readonly commands: readonly RouteCommand[];
  readonly buckets: StressStudioBuckets;
  readonly results: readonly StressStudioResult[];
  readonly setMode: (mode: StressCommandMode) => void;
  readonly run: () => Promise<void>;
  readonly refresh: () => void;
  readonly currentMode: StressCommandMode;
  readonly status: 'initializing' | 'ready' | 'running';
};

export const useRecoveryStressCommandStudio = (tenant: string, initialMode: StressCommandMode): StressStudioHook => {
  const [state, setState] = useState(() => ({
    ...commandWorkspaceState(tenant),
    mode: initialMode,
  }));
  const [results, setResults] = useState<readonly StressStudioResult[]>([]);
  const [status, setStatus] = useState<'initializing' | 'ready' | 'running'>('ready');

  const commands = useMemo(() => {
    return state.commands;
  }, [state.commands]);

  const buckets = useMemo<StressStudioBuckets>(() => {
    return dispatchBucketsFromCommands(commands);
  }, [commands]);

  const setMode = useCallback((nextMode: StressCommandMode) => {
    setState((current) => ({
      ...current,
      mode: nextMode,
      refreshToken: current.refreshToken + 1,
    }));
  }, []);

  const run = useCallback(async () => {
    setStatus('running');
    const payload = await executeStudioPayload(state.tenant, commands, state.mode);
    setResults(payload);
    setState((current) => ({
      ...current,
      runId: `run-${resolveSeed(current.tenant, current.mode)}`,
      progress: payload.length,
      refreshToken: current.refreshToken + 1,
    }));
    setStatus('ready');
  }, [commands, state.mode, state.tenant]);

  const refresh = useCallback(() => {
    const commands = buildStudioCommands(state.commands.length || 24);
    const nextMode = nextStudioMode(state.mode);
    setState((current) => ({
      ...current,
      running: !current.running,
      commands,
      mode: nextMode,
      refreshToken: current.refreshToken + 1,
    }));
  }, [state.commands.length, state.mode]);

  return {
    state,
    commands,
    buckets,
    results,
    setMode,
    run,
    refresh,
    currentMode: state.mode,
    status,
  };
};
