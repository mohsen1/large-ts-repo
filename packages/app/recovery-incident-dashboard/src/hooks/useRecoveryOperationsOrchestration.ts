import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { RecoveryOperationsInsightEngine, summarizeImpact } from '@service/recovery-operations-engine/strategy-insights';
import type { RecoveryWindow } from '@domain/recovery-orchestration';

interface OrchestrationHookState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly summary: string;
  readonly details: readonly string[];
  readonly activePlans: readonly string[];
  readonly warnings: readonly string[];
  readonly band: 'minimal' | 'moderate' | 'high' | 'severe' | 'unknown';
}

export interface OrchestrationCommand {
  readonly command: 'refresh' | 'snapshot' | 'analyze-window';
  readonly tenantId: string;
}

const initial: OrchestrationHookState = {
  status: 'idle',
  summary: '',
  details: [],
  activePlans: [],
  warnings: [],
  band: 'unknown',
};

export const useRecoveryOperationsOrchestration = (repository: RecoveryOperationsRepository, tenantId: string) => {
  const engine = useMemo(() => new RecoveryOperationsInsightEngine(repository), [repository]);
  const [state, setState] = useState<OrchestrationHookState>(initial);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', warnings: [] }));
    try {
      const board = await engine.loadBoard({ tenant: tenantId, status: 'running' });
      const details = board.matrixSummary.map((row) => `${row.band}:${row.count}`);
      const band: OrchestrationHookState['band'] = board.board.blocked.length > 0 ? 'high' : board.board.active.length > 0 ? 'moderate' : 'minimal';
      const summary = `${board.tenant}: plans=${board.planCount} runtimes=${board.runtimeCount}`;

      setState({
        status: 'ready',
        summary,
        details,
        warnings: [],
        activePlans: board.board.active.map((entry) => String(entry.runId)),
        band,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        warnings: [error instanceof Error ? error.message : 'refresh failed'],
      }));
    }
  }, [engine, tenantId]);

  const analyzeWindow = useCallback(async (windows: readonly RecoveryWindow[]) => {
    await refresh();
    if (windows.length === 0) {
      return;
    }
    const runtimes = await engine.loadRunSummaries({ tenant: tenantId, status: 'running' });
    setState((current) => ({
      ...current,
      details: [
        ...current.details,
        ...runtimes.map((runtime) => summarizeImpact(runtime.impactProfile)),
      ],
    }));
  }, [engine, refresh, tenantId]);

  const runCommand = useCallback(async (command: OrchestrationCommand) => {
    if (command.command === 'refresh') {
      await refresh();
      return;
    }
    if (command.command === 'snapshot') {
      const digest = await engine.buildDigest({ tenant: tenantId, status: 'running' });
      setState((current) => ({
        ...current,
        summary: digest.summary,
        details: [...current.details, ...digest.details],
      }));
      return;
    }
    await analyzeWindow([
      {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 120_000).toISOString(),
        timezone: 'UTC',
      },
    ]);
  }, [analyzeWindow, refresh, tenantId, engine]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh, analyzeWindow, runCommand, isReady: state.status === 'ready' };
};
