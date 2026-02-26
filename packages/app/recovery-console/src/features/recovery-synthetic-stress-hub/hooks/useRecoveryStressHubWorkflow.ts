import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent } from 'react';
import {
  runCompilerStressHub,
  runCompilerStressHubLabGrid,
  type StressHubSession,
} from '@domain/recovery-lab-synthetic-orchestration';

type WorkflowMode = 'strict' | 'relaxed' | 'diagnostic' | 'batch' | 'replay';

type WorkflowState = {
  readonly mode: WorkflowMode;
  readonly tenant: string;
  readonly session: StressHubSession | null;
  readonly active: boolean;
  readonly history: readonly StressHubSession[];
};

type WorkflowEvent =
  | { readonly type: 'mode'; readonly mode: WorkflowMode }
  | { readonly type: 'tenant'; readonly tenant: string }
  | { readonly type: 'run' }
  | { readonly type: 'sweep' }
  | { readonly type: 'complete'; readonly session: StressHubSession }
  | { readonly type: 'fail'; readonly reason: string };

type AsyncDisposer = {
  readonly [Symbol.dispose]: () => void;
  readonly [Symbol.asyncDispose]?: () => Promise<void>;
};

const runEnvelope = <T,>(label: string, task: () => Promise<T>): Promise<T> =>
  Promise.resolve().then(() => task()).catch((error) => {
    throw new Error(`${label}: ${String(error)}`);
  });

const createAsyncDisposer = () => {
  const controller = new AbortController();
  return {
    [Symbol.dispose]: () => {
      controller.abort();
    },
    [Symbol.asyncDispose]: async () => {
      controller.abort();
      await Promise.resolve(undefined);
    },
  } satisfies AsyncDisposer;
};

const reducer = (state: WorkflowState, event: WorkflowEvent): WorkflowState => {
  if (event.type === 'mode') {
    return { ...state, mode: event.mode };
  }
  if (event.type === 'tenant') {
    return { ...state, tenant: event.tenant };
  }
  if (event.type === 'run') {
    return { ...state, active: true };
  }
  if (event.type === 'complete') {
    return {
      ...state,
      active: false,
      session: event.session,
      history: [event.session, ...state.history].slice(0, 8),
    };
  }
  if (event.type === 'sweep') {
    return { ...state, active: true, history: [] };
  }
  if (event.type === 'fail') {
    return { ...state, active: false };
  }
  return state;
};

export const useRecoveryStressHubWorkflow = () => {
  const [state, setState] = useState<WorkflowState>({
    mode: 'strict',
    tenant: 'default',
    session: null,
    active: false,
    history: [],
  });

  const [errors, setErrors] = useState<string[]>([]);

  const setMode = useCallback((mode: WorkflowMode) => {
    setState((previous) => reducer(previous, { type: 'mode', mode }));
  }, []);

  const setTenant = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setState((previous) => reducer(previous, { type: 'tenant', tenant: event.target.value }));
  }, []);

  const runSession = useCallback(async () => {
    setErrors([]);
    setState((previous) => reducer(previous, { type: 'run' }));
    const disposer = createAsyncDisposer();
    try {
      const session = await runEnvelope('stress-hub-session', async () => {
        const result = await runCompilerStressHub(state.mode, { tenant: state.tenant });
        return result.session;
      });

      setState((previous) => reducer(previous, { type: 'complete', session }));
    } catch (error) {
      setErrors((previous) => [...previous, String(error)]);
      setState((previous) => reducer(previous, { type: 'fail', reason: String(error) }));
    } finally {
      disposer[Symbol.dispose]();
    }
  }, [state.mode, state.tenant]);

  const runGrid = useCallback(async () => {
    setErrors([]);
    setState((previous) => reducer(previous, { type: 'sweep' }));
    const disposer = createAsyncDisposer();
    try {
      const result = await runEnvelope('stress-hub-grid', () => runCompilerStressHubLabGrid());
      const sessions = result.sessions.map((entry) => entry.session);
      setState((previous) => ({
        ...previous,
        active: false,
        session: sessions[0] ?? previous.session,
        history: sessions.concat(previous.history).slice(0, 8),
      }));
    } catch (error) {
      setErrors((previous) => [...previous, String(error)]);
      setState((previous) => reducer(previous, { type: 'fail', reason: String(error) }));
    } finally {
      disposer[Symbol.dispose]();
    }
  }, []);

  useEffect(() => {
    if (state.history.length > 4) {
      setErrors((previous) => previous);
    }
  }, [state.history.length]);

  const metrics = useMemo(
    () =>
      state.history.map((entry) => ({
        id: entry.id,
        mode: entry.mode,
        routeCount: entry.telemetry.routeCount,
        solverWeight: entry.telemetry.solverWeight,
      })),
    [state.history],
  );

  const snapshot = useSyncExternalStore(
    () => () => {
      return () => {};
    },
    () => ({
      ...state,
      modeCount: state.history.length,
      metrics,
      active: state.active,
    }),
    () => ({
      ...state,
      modeCount: state.history.length,
      metrics,
      active: false,
    }),
  );

  return {
    session: state.session,
    mode: state.mode,
    tenant: state.tenant,
    active: state.active,
    metrics: snapshot.metrics,
    errors,
    runSession,
    runGrid,
    setMode,
    setTenant,
  } as const;
};
