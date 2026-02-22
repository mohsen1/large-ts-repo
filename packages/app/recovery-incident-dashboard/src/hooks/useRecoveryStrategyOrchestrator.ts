import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createRecoveryStrategyOrchestrator,
  type OrchestrationWorkspace,
  type StrategyOrchestratorConfig,
  type OrchestrationSummary,
} from '@service/recovery-strategy-orchestrator';
import type { StrategyTemplate } from '@domain/recovery-orchestration-planning';
import { createRecoveryStrategyStore } from '@data/recovery-strategy-store';

export interface StrategyOrchestratorState {
  readonly tenantId: string;
  readonly loading: boolean;
  readonly summary: OrchestrationSummary | null;
  readonly workspace: OrchestrationWorkspace | null;
  readonly error: string;
}

interface StrategyOrchestratorResult {
  readonly state: StrategyOrchestratorState;
  readonly actions: {
    refresh: () => Promise<void>;
    buildWorkspace: (template: StrategyTemplate) => Promise<void>;
    startRun: (template: StrategyTemplate) => Promise<void>;
    appendCommand: (planId: string, commandSummary: string) => Promise<void>;
  };
}

export const useRecoveryStrategyOrchestrator = (tenantId: string): StrategyOrchestratorResult => {
  const [state, setState] = useState<StrategyOrchestratorState>({
    tenantId,
    loading: false,
    summary: null,
    workspace: null,
    error: '',
  });

  const store = useMemo(() => createRecoveryStrategyStore(), []);
  const config = useMemo<StrategyOrchestratorConfig>(
    () => ({
      tenantId,
      owner: 'ui',
      refreshIntervalMs: 12_000,
      store,
    }),
    [tenantId, store],
  );

  const orchestrator = useMemo(() => createRecoveryStrategyOrchestrator(config), [config]);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    const summary = await orchestrator.state();
    setState((current) => ({
      ...current,
      loading: false,
      summary,
    }));
  }, [orchestrator]);

  const buildWorkspace = useCallback(
    async (template: StrategyTemplate) => {
      setState((current) => ({ ...current, loading: true, error: '' }));
      const result = await orchestrator.buildWorkspace(template);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          loading: false,
          error: result.error,
        }));
        return;
      }
      setState((current) => ({
        ...current,
        loading: false,
        workspace: result.value,
      }));
    },
    [orchestrator],
  );

  const startRun = useCallback(
    async (template: StrategyTemplate) => {
      const result = await orchestrator.startRun(template);
      if (!result.ok) {
        setState((current) => ({ ...current, error: result.error }));
        return;
      }
      setState((current) => ({
        ...current,
        workspace: current.workspace
          ? {
              ...current.workspace,
              run: result.value,
            }
          : current.workspace,
      }));
    },
    [orchestrator],
  );

  const appendCommand = useCallback(
    async (planId: string, commandSummary: string) => {
      const result = await orchestrator.appendCommand(planId, commandSummary);
      if (!result.ok) {
        setState((current) => ({ ...current, error: result.error }));
      }
    },
    [orchestrator],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    state,
    actions: {
      refresh,
      buildWorkspace,
      startRun,
      appendCommand,
    },
  };
};
