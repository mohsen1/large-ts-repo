import { useCallback, useEffect, useMemo, useState } from 'react';
import { type EcosystemWorkspace, loadWorkspace, startDryRun, startEcosystemRun } from '../services/ecosystemService';
import type { Result } from '@shared/result';

export interface UseEcosystemWorkspaceProps {
  readonly tenantId: string;
  readonly namespace: string;
}

export interface WorkspaceState {
  readonly workspace: EcosystemWorkspace | undefined;
  readonly running: boolean;
  readonly error: string | undefined;
  readonly history: ReadonlyArray<string>;
}

export interface WorkspaceActions {
  readonly refresh: () => Promise<void>;
  readonly run: () => Promise<void>;
  readonly dryRun: () => Promise<void>;
}

const defaultError = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause ?? 'unexpected-error');

export const useRecoveryEcosystemWorkspace = ({ tenantId, namespace }: UseEcosystemWorkspaceProps): WorkspaceState & WorkspaceActions => {
  const [workspace, setWorkspace] = useState<EcosystemWorkspace | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<readonly string[]>([]);

  const load = useCallback(async () => {
    setRunning(true);
    setError(undefined);
    try {
      const payload = await loadWorkspace(tenantId);
      setWorkspace(payload);
      setHistory((previous: readonly string[]) =>
        [`workspace:${tenantId}:${payload.namespace}:${payload.snapshotCount}`, ...previous].slice(0, 20),
      );
    } catch (cause) {
      setError(defaultError(cause));
    } finally {
      setRunning(false);
    }
  }, [tenantId]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(undefined);
    try {
      const result = await startEcosystemRun({ tenantId, namespace, dryRun: false });
      setHistory((previous: readonly string[]) => [`run-complete:${result.run.id}`, ...previous].slice(0, 20));
      await load();
    } catch (cause) {
      setError(defaultError(cause));
    } finally {
      setRunning(false);
    }
  }, [tenantId, namespace, load]);

  const dryRun = useCallback(async () => {
    setRunning(true);
    setError(undefined);
    try {
      const result = await startDryRun(tenantId, namespace);
      setHistory((previous: readonly string[]) => [`dry-run-complete:${result.run.id}`, ...previous].slice(0, 20));
      await load();
    } catch (cause) {
      setError(defaultError(cause));
    } finally {
      setRunning(false);
    }
  }, [tenantId, namespace, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    workspace,
    running,
    error,
    history,
    refresh: load,
    run,
    dryRun,
  } satisfies WorkspaceState & WorkspaceActions;
};

export const useRunResult = async (resultPromise: Promise<Result<unknown>>): Promise<void> => {
  const result = await resultPromise;
  if (!result.ok) {
    throw result.error;
  }
  return;
};

export const useWorkspaceDigest = (workspace: EcosystemWorkspace | undefined): string =>
  useMemo(() =>
    workspace
      ? `${workspace.namespace}:${workspace.snapshotCount}:${workspace.active}`
      : 'workspace:unknown',
  [workspace?.namespace, workspace?.snapshotCount, workspace?.active]);
