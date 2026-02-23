import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReadinessOperationsConsole,
  type ReadinessCommandInput,
  type ReadinessOperationsConsoleStatus,
} from '@service/recovery-readiness-orchestrator';
import type { ReadinessRunId } from '@domain/recovery-readiness';

interface ReadinessCommandForm {
  tenantId: string;
  signals: number;
  includeAuto: boolean;
}

interface ReadinessConsoleState {
  status: ReadinessOperationsConsoleStatus | null;
  runs: ReadinessRunRow[];
  loading: boolean;
  logs: readonly string[];
  lastError: string | null;
  form: ReadinessCommandForm;
}

export interface ReadinessRunRow {
  runId: ReadinessRunId;
  owner: string;
  state: string;
  riskBand: string;
  summary: string;
}

export interface ReadinessUseCase {
  state: ReadinessConsoleState;
  runBootstrap: () => Promise<void>;
  runReconcile: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  setTenantId: (tenantId: string) => void;
  setSignals: (signals: number) => void;
  setAuto: (enabled: boolean) => void;
}

export const useReadinessConsole = (): ReadinessUseCase => {
  const [state, setState] = useState<ReadinessConsoleState>({
    status: null,
    runs: [],
    loading: false,
    logs: [],
    lastError: null,
    form: {
      tenantId: 'tenant-a',
      signals: 12,
      includeAuto: true,
    },
  });

  const consoleRef = useRef(new ReadinessOperationsConsole());

  const pushLog = useCallback((next: string) => {
    setState((current) => ({
      ...current,
      logs: [`${new Date().toLocaleTimeString()}: ${next}`, ...current.logs].slice(0, 24),
    }));
  }, []);

  const setTenantId = useCallback((tenantId: string) => {
    setState((current) => ({ ...current, form: { ...current.form, tenantId } }));
  }, []);

  const setSignals = useCallback((signals: number) => {
    setState((current) => ({
      ...current,
      form: { ...current.form, signals: Math.max(1, Math.min(40, signals)) },
    }));
  }, []);

  const setAuto = useCallback((includeAuto: boolean) => {
    setState((current) => ({ ...current, form: { ...current.form, includeAuto } }));
  }, []);

  const refresh = useCallback(async () => {
    const nextStatus = await consoleRef.current.snapshot();
    setState((current) => ({
      ...current,
      status: nextStatus,
    }));
  }, []);

  const runBootstrap = useCallback(async () => {
    const command: ReadinessCommandInput = {
      verb: 'bootstrap',
      tenantId: state.form.tenantId,
      signals: state.form.signals,
      owner: 'adaptive-ops-console',
    };

    setState((current) => ({ ...current, loading: true, lastError: null }));
    try {
      const runId = await consoleRef.current.bootstrap(command);
      const view = await consoleRef.current.status(runId);
      if (!view) {
        return;
      }

      setState((current) => ({
        ...current,
        runs: [
          {
            runId: view.runId,
            owner: view.owner,
            state: view.state,
            riskBand: view.riskBand,
            summary: view.summary,
          },
          ...current.runs,
        ].slice(0, 25),
      }));
      pushLog(`bootstrap tenant=${state.form.tenantId} signals=${state.form.signals}`);
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        lastError: error instanceof Error ? error.message : 'bootstrap failed',
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }, [pushLog, refresh, state.form.tenantId, state.form.signals]);

  const runReconcile = useCallback(async () => {
    const first = state.runs[0];
    if (!first) {
      setState((current) => ({ ...current, lastError: 'no runs to reconcile' }));
      return;
    }

    setState((current) => ({ ...current, loading: true, lastError: null }));
    try {
      await consoleRef.current.reconcile(first.runId);
      const view = await consoleRef.current.status(first.runId);
      if (view) {
        setState((current) => ({
          ...current,
          runs: current.runs.map((run) => (run.runId === first.runId ? { ...run, state: view.state, summary: view.summary } : run)),
        }));
      }
      pushLog(`reconcile run=${first.runId}`);
      await refresh();
    } catch (error) {
      setState((current) => ({
        ...current,
        lastError: error instanceof Error ? error.message : 'reconcile failed',
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }, [pushLog, refresh, state.runs]);

  const reset = useCallback(() => {
    setState({
      status: null,
      runs: [],
      loading: false,
      logs: [],
      lastError: null,
      form: {
        tenantId: 'tenant-a',
        signals: 12,
        includeAuto: true,
      },
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleRuns = useMemo(() => state.runs, [state.runs]);

  return {
    state: {
      ...state,
      logs: state.form.includeAuto ? state.logs.map((entry) => `auto ${entry}`) : state.logs,
      runs: visibleRuns,
    },
    runBootstrap,
    runReconcile,
    refresh,
    reset,
    setTenantId,
    setSignals,
    setAuto,
  };
};
