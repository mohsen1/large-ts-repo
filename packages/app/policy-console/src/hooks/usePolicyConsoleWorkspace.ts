import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  InMemoryPolicyStore,
  PolicyStoreArtifact,
  PolicyStoreSort,
} from '@data/policy-orchestration-store';
import {
  PolicyControlPlane,
  PolicyOrchestrationRunner,
  collectRunTelemetry,
} from '@service/policy-orchestration-engine';

export interface ConsoleWorkspaceState {
  artifacts: readonly PolicyStoreArtifact[];
  isLoading: boolean;
  query: string;
  activeArtifactId: string | null;
  runMode: 'full' | 'dry';
  error: string | null;
}

interface UsePolicyConsoleWorkspaceResult {
  state: ConsoleWorkspaceState;
  refresh: () => Promise<void>;
  runDry: (artifactId: string) => Promise<void>;
  runLive: (artifactId: string) => Promise<void>;
  clearError: () => void;
  setQuery: (query: string) => void;
}

const seedOrchestrator = 'orchestrator:policy-console';

export function usePolicyConsoleWorkspace(): UsePolicyConsoleWorkspaceResult {
  const [state, setState] = useState<ConsoleWorkspaceState>({
    artifacts: [],
    isLoading: true,
    query: '',
    activeArtifactId: null,
    runMode: 'dry',
    error: null,
  });
  const [store] = useState(() => new InMemoryPolicyStore());
  const control = useMemo(() => new PolicyControlPlane(store, seedOrchestrator), [store]);
  const orchestrator = useMemo(() => new PolicyOrchestrationRunner(store), [store]);

  const hydrate = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await control.queryWorkspace();
      const sorted = await store.searchArtifacts({ orchestratorId: seedOrchestrator }, { key: 'updatedAt', order: 'desc' } as PolicyStoreSort);
      setState((current) => ({
        ...current,
        artifacts: snapshot.artifacts.length > 0 ? snapshot.artifacts : sorted,
        isLoading: false,
      }));
      await collectRunTelemetry(store, seedOrchestrator);
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'failed to hydrate workspace',
      }));
    }
  }, [control, store]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const runDry = useCallback(
    async (artifactId: string) => {
      const candidate = state.artifacts.find((item) => item.artifactId === artifactId);
      if (!candidate) return;
      try {
        const contract = {
          service: candidate.namespace,
          entities: [{ name: candidate.name, fields: [] }],
        };
        await orchestrator.run({
          orchestratorId: seedOrchestrator,
          contract,
          nodes: [],
          windows: [],
          createdBy: candidate.namespace,
        }, {
          orchestratorId: seedOrchestrator,
          runBy: candidate.namespace,
          dryRun: true,
          reason: `dry-run-${artifactId}`,
          requestedConcurrency: 1,
          contexts: [],
        });
        await hydrate();
      } catch (error) {
        setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'dry run failed' }));
      }
    },
    [hydrate, orchestrator, state.artifacts],
  );

  const runLive = useCallback(
    async (artifactId: string) => {
      const candidate = state.artifacts.find((item) => item.artifactId === artifactId);
      if (!candidate) return;
      setState((current) => ({ ...current, runMode: 'full' }));
      await runDry(artifactId);
      setState((current) => ({ ...current, runMode: 'dry' }));
    },
    [runDry, state.artifacts],
  );

  return {
    state: {
      ...state,
      artifacts: state.artifacts.filter((item) => state.query.length === 0 || item.name.includes(state.query)),
    },
    refresh: hydrate,
    runDry,
    runLive,
    clearError: () => setState((current) => ({ ...current, error: null })),
    setQuery: (query: string) => setState((current) => ({ ...current, query })),
  };
}
