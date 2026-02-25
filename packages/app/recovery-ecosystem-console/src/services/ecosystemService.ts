import { useCallback } from 'react';
import {
  type RecoveryEcosystemOrchestrator,
  createServiceRuntime,
  type OrchestratorRunOptions,
  type OrchestratorResult,
} from '@service/recovery-ecosystem-orchestrator';

const runtime = createServiceRuntime({
  timeoutMs: 16,
  retryLimit: 2,
  namespace: 'ecosystem-console-runtime',
});

export const ecosystemRuntime = runtime.orchestrator;

export interface RunCommandInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly dryRun: boolean;
}

export interface EcosystemWorkspace {
  readonly namespace: string;
  readonly snapshotCount: number;
  readonly active: number;
}

const normalizeInput = (value: string): string => value.trim().toLowerCase();

export const startEcosystemRun = async (input: RunCommandInput): Promise<OrchestratorResult> => {
  const run = await ecosystemRuntime.run(input as OrchestratorRunOptions);
  if (!run.ok) {
    throw new Error(`run-failed:${run.code ?? 'unknown'}`);
  }
  return run.value;
};

export const hydrateEcosystemRun = async (runId: string) => {
  const hydrated = await ecosystemRuntime.hydrate(runId);
  if (!hydrated.ok) {
    return undefined;
  }
  return hydrated.value;
};

export const loadWorkspace = async (tenantId: string): Promise<EcosystemWorkspace> => {
  const payload = await ecosystemRuntime.runWorkspace(normalizeInput(tenantId));
  return payload;
};

export const withRetry = async <T,>(
  task: () => Promise<T>,
  retries: number,
): Promise<T> => {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      attempt += 1;
    }
  }
};

export const startDryRun = (tenantId: string, namespace: string) => startEcosystemRun({ tenantId, namespace, dryRun: true });

export const useEcosystemService = () => ({
  start: useCallback((tenantId: string, namespace: string) => startEcosystemRun({ tenantId, namespace, dryRun: false }), [
    normalizeInput,
  ]),
});
