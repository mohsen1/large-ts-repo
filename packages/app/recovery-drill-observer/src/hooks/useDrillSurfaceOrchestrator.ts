import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { createSurfaceOrchestrator, makeAnalysis } from '@service/recovery-drill-surface-orchestrator';
import type {
  SurfaceAnalysis,
  SurfaceCommand,
  SurfaceCommandResult,
  SurfaceState,
  SurfaceWindow,
} from '@service/recovery-drill-surface-orchestrator';
import type { DrillRunSnapshot } from '@domain/recovery-drill-lab';
import { createRepository } from '@data/recovery-drill-lab-store';

const repository = createRepository();
const orchestrator = createSurfaceOrchestrator({
  tenant: 'ops-core',
  zone: 'global',
  environment: 'staging',
  defaultScenarioId: 'scenario-main',
  requestedBy: 'ui-dashboard',
  repository,
});

interface WorkspaceSummary {
  readonly completed: number;
  readonly failed: number;
  readonly queued: number;
  readonly windows: number;
}

interface SurfaceStatePayload {
  readonly running: boolean;
  readonly command: SurfaceCommand | undefined;
  readonly analyses: readonly SurfaceAnalysis[];
  readonly windows: readonly SurfaceWindow[];
  readonly stats: SurfaceState;
  readonly latestRunId: string | undefined;
  readonly error: string | undefined;
  readonly workspaceSummary: WorkspaceSummary;
  readonly runOne: () => Promise<void>;
  readonly runDry: () => Promise<void>;
  readonly refresh: () => void;
}

const defaultWindow: SurfaceWindow = {
  id: 'ops-core-window',
  profile: {
    tenant: 'ops-core',
    zone: 'global',
    environment: 'staging',
    maxConcurrentRuns: 3,
    preferredPriority: 'high',
  },
  from: new Date().toISOString(),
  to: new Date(Date.now() + 120 * 60000).toISOString(),
  createdAt: new Date().toISOString(),
  tags: ['ui', 'recovery', 'surface'],
};

const toAnalysis = (run: DrillRunSnapshot): SurfaceAnalysis => makeAnalysis(run);

export const useDrillSurfaceOrchestrator = (workspaceId: string): SurfaceStatePayload => {
  const [command, setCommand] = useState<SurfaceCommand | undefined>(undefined);
  const [analyses, setAnalyses] = useState<readonly SurfaceAnalysis[]>([]);
  const [windows, setWindows] = useState<readonly SurfaceWindow[]>([defaultWindow]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [latestRunId, setLatestRunId] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<SurfaceState>({
    commandQueue: [],
    completedCount: 0,
    failedCount: 0,
  });

  const refresh = useCallback(() => {
    const workspace = withBrand(workspaceId, 'DrillWorkspaceId');
    const runs = repository.listRuns({ workspaceId: workspace });
    const mapped = runs.map(toAnalysis);
    setAnalyses(mapped);
    const summary = orchestrator.summarizeWorkspace(workspaceId);
    setStats((current) => ({
      ...current,
      completedCount: summary.completedCount,
      failedCount: summary.failedCount,
      commandQueue: current.commandQueue,
    }));
    setLatestRunId(mapped[0]?.runId);
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runOne = useCallback(async () => {
    setRunning(true);
    setError(undefined);

    const response = await orchestrator.runOnce();
    if (!response.ok) {
      setError(response.error.message);
      setRunning(false);
      return;
    }

    const next = response.value;
    setCommand(next.command);
    setAnalyses((current) => [
      ...toAnalysisList(next),
      ...current,
    ]);
    setStats(orchestrator.workspaceState());
    setLatestRunId(next.snapshot?.id);
    setRunning(false);
  }, []);

  const runDry = useCallback(async () => {
    setError(undefined);
    const response = await orchestrator.runDry();
    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    const next = response.value;
    setCommand(next.command);
    setWindows((current) => [
      ...current,
      {
        id: `${next.command.commandId}-preview`,
        profile: next.command.profile,
        from: new Date().toISOString(),
        to: new Date(Date.now() + 15 * 60000).toISOString(),
        createdAt: new Date().toISOString(),
        tags: ['preview', next.command.type],
      },
    ]);
  }, []);

  const workspaceSummary: WorkspaceSummary = useMemo(
    () => ({
      completed: stats.completedCount,
      failed: stats.failedCount,
      queued: stats.commandQueue.length,
      windows: windows.length,
    }),
    [stats.completedCount, stats.failedCount, stats.commandQueue.length, windows.length],
  );

  return {
    running,
    command,
    analyses,
    windows,
    stats,
    latestRunId,
    error,
    workspaceSummary,
    runOne,
    runDry,
    refresh,
  };
};

const toAnalysisList = (result: SurfaceCommandResult): readonly SurfaceAnalysis[] => {
  if (!result.snapshot || !result.analysis) {
    return [];
  }
  return [result.analysis];
};
