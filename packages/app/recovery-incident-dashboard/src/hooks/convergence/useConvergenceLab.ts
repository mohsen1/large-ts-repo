import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ConvergenceRunEvent,
  ConvergenceWorkspace,
} from '@domain/recovery-ops-orchestration-lab';
import {
  bootstrapConvergenceWorkspace,
  collectWorkspaceSnapshot,
  reorderPlans,
  streamRun,
  summarizeWorkspace,
} from '../../services/convergenceLabService';

export interface ConvergenceLabState {
  readonly workspace: ConvergenceWorkspace | undefined;
  readonly status: 'idle' | 'loading' | 'running' | 'complete' | 'error';
  readonly summary: string;
  readonly planCount: number;
  readonly runEvents: readonly ConvergenceRunEvent[];
}

export const useConvergenceLab = () => {
  const [workspace, setWorkspace] = useState<ConvergenceWorkspace | undefined>(undefined);
  const [status, setStatus] = useState<ConvergenceLabState['status']>('idle');
  const [summary, setSummary] = useState('');
  const [runEvents, setRunEvents] = useState<readonly ConvergenceRunEvent[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadWorkspace = useCallback(async () => {
    try {
      setStatus('loading');
      const nextWorkspace = await bootstrapConvergenceWorkspace();
      const ordered = reorderPlans(nextWorkspace.plans);
      const snapshot = await collectWorkspaceSnapshot({ ...nextWorkspace, plans: ordered });
      setWorkspace({ ...nextWorkspace, plans: ordered, id: snapshot.workspaceId as ConvergenceWorkspace['id'] });
      setSummary(`${snapshot.domain} · ${snapshot.planCount} plans · ${snapshot.risk}`);
      setStatus('idle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'failed to load workspace');
      setStatus('error');
    }
  }, []);

  const runSimulation = useCallback(async () => {
    if (!workspace) {
      return;
    }

    setStatus('running');
    setRunEvents([]);
    setError(undefined);

    for await (const chunk of streamRun(workspace)) {
      setRunEvents((prev) => (chunk.events.length > prev.length ? chunk.events : prev));
      setSummary(`run=${chunk.runId} events=${chunk.events.length}`);
      if (chunk.events.length > 0) {
        const latest = chunk.events.at(-1);
        if (latest?.type === 'error') {
          setError('run emitted error');
        }
      }
    }

    const result = await summarizeWorkspace(workspace);
    setSummary((previous) => `${previous} · status=${result.status} duration=${result.durationMs}ms`);
    setStatus('complete');
  }, [workspace]);

  const reset = useCallback(() => {
    setRunEvents([]);
    setStatus('idle');
    setSummary('');
    setError(undefined);
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const workspaceId = useMemo(() => workspace?.id ?? 'not-ready', [workspace]);
  const planCount = workspace?.plans.length ?? 0;

  return {
    workspace,
    status,
    summary,
    runEvents,
    error,
    workspaceId,
    planCount,
    runSimulation,
    reset,
    reload: loadWorkspace,
  } satisfies {
    workspace: ConvergenceWorkspace | undefined;
    status: ConvergenceLabState['status'];
    summary: string;
    runEvents: readonly ConvergenceRunEvent[];
    error: string | undefined;
    workspaceId: string;
    planCount: number;
    runSimulation: () => Promise<void>;
    reset: () => void;
    reload: () => void;
  };
};
