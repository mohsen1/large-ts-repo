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
import {
  PolicyPluginEnvelope,
  runPolicyWorkspaceWithPlugins,
} from '@service/policy-orchestration-engine/plugin-runner';

export interface ConsoleWorkspaceState {
  artifacts: readonly PolicyStoreArtifact[];
  isLoading: boolean;
  query: string;
  activeArtifactId: string | null;
  runMode: 'full' | 'dry';
  error: string | null;
}

interface UsePolicyConsoleWorkspaceResult {
  state: ConsoleWorkspaceState & {
    orchestratorId: string | null;
    selectedArtifactIds: readonly string[];
    lastPluginEnvelope: PolicyPluginEnvelope | null;
    pluginRunType: 'none' | 'dry' | 'live';
  };
  refresh: () => Promise<void>;
  runDry: (artifactId: string) => Promise<void>;
  runLive: (artifactId: string) => Promise<void>;
  clearError: () => void;
  setQuery: (query: string) => void;
}

const seedOrchestrator = 'orchestrator:policy-console';

export function usePolicyConsoleWorkspace(): UsePolicyConsoleWorkspaceResult {
  const [state, setState] = useState<ConsoleWorkspaceState & {
    orchestratorId: string | null;
    selectedArtifactIds: readonly string[];
    lastPluginEnvelope: PolicyPluginEnvelope | null;
    pluginRunType: 'none' | 'dry' | 'live';
  }>({
    artifacts: [],
    isLoading: true,
    query: '',
    activeArtifactId: null,
    runMode: 'dry',
    error: null,
    orchestratorId: seedOrchestrator,
    selectedArtifactIds: [],
    lastPluginEnvelope: null,
    pluginRunType: 'none',
  });

  const [store] = useState(() => new InMemoryPolicyStore());
  const control = useMemo(() => new PolicyControlPlane(store, seedOrchestrator), [store]);
  const orchestrator = useMemo(() => new PolicyOrchestrationRunner(store), [store]);

  const hydrate = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await control.queryWorkspace();
      const sorted = await store.searchArtifacts(
        { orchestratorId: seedOrchestrator },
        { key: 'updatedAt', order: 'desc' } as PolicyStoreSort,
      );
      const activeArtifactIds = sorted
        .filter((artifact) => artifact.state === 'active')
        .slice(0, 3)
        .map((artifact) => artifact.artifactId);
      const snapshotArtifacts = snapshot.artifacts.length > 0 ? snapshot.artifacts : sorted;
      await collectRunTelemetry(store, seedOrchestrator);
      setState((current) => ({
        ...current,
        artifacts: snapshotArtifacts,
        isLoading: false,
        selectedArtifactIds: activeArtifactIds,
        orchestratorId: seedOrchestrator,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'failed to hydrate workspace',
      }));
    }
  }, [control, store]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const run = useCallback(
    async (artifactId: string, dryRun: boolean) => {
      const candidate = state.artifacts.find((item) => item.artifactId === artifactId);
      if (!candidate) return;

      const workspace = {
        orchestratorId: seedOrchestrator,
        contract: {
          service: candidate.namespace,
          entities: [{ name: candidate.name, fields: [] }],
        },
        nodes: [],
        windows: [],
        createdBy: candidate.namespace,
      };

      try {
        setState((current) => ({
          ...current,
          runMode: dryRun ? 'dry' : 'full',
          error: null,
        }));

        const result = await runPolicyWorkspaceWithPlugins(
          workspace,
          {
            orchestratorId: seedOrchestrator,
            runBy: candidate.namespace,
            dryRun,
            reason: `run-${artifactId}`,
            requestedConcurrency: 1,
            contexts: [
              {
                principal: candidate.namespace,
                resource: candidate.name,
                action: 'simulate',
                attributes: {
                  artifactId,
                  namespace: candidate.namespace,
                  orchestratorId: seedOrchestrator,
                },
                now: new Date(),
              },
            ],
          },
          { store },
        );

        setState((current) => ({
          ...current,
          lastPluginEnvelope: result,
          pluginRunType: dryRun ? 'dry' : 'live',
        }));
        await hydrate();
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'run failed',
          pluginRunType: dryRun ? 'dry' : 'live',
        }));
      } finally {
        setState((current) => ({ ...current, runMode: 'dry' }));
      }
    },
    [hydrate, state.artifacts, store],
  );

  const runDry = useCallback((artifactId: string) => run(artifactId, true), [run]);
  const runLive = useCallback((artifactId: string) => run(artifactId, false), [run]);

  return {
    state: {
      ...state,
      artifacts: state.artifacts.filter((item) => state.query.length === 0 || item.name.includes(state.query)),
      selectedArtifactIds: state.selectedArtifactIds,
      orchestratorId: state.orchestratorId,
    },
    refresh: hydrate,
    runDry,
    runLive,
    clearError: () => setState((current) => ({ ...current, error: null })),
    setQuery: (query: string) => setState((current) => ({ ...current, query })),
  };
}
