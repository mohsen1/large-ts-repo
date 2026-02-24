import { useCallback, useEffect, useState } from 'react';
import {
  InMemoryPolicyStore,
  QueryEngineResult,
  PolicyStoreArtifact,
  PolicyStoreFilters,
  PolicyStoreSort,
  collectStoreTelemetry,
  collectStoreEventsAsLedger,
  collectStoreEvents,
  summarizeLedger,
  createQueryPlan,
  executeQueryPlan,
} from '@data/policy-orchestration-store';
import { NoInfer } from '@shared/type-level';
import { PolicyLabOrchestrator } from '@service/policy-orchestration-engine/lab-orchestrator';
import {
  StudioMode,
  StudioSummary,
  StudioWorkspace,
  StudioTopology,
  StudioTrace,
  StudioTelemetryPoint,
  asCommand,
  newCommandId,
  studioSections,
  toStudioSection,
  newStudioNodeId,
  mapTopologyNodes,
  StudioCommandId,
  StudioTopologyEdge,
} from '../models/policy-studio-types';
import {
  StrategyRegistry,
  StrategyRegistrySnapshot,
} from '@domain/policy-orchestration/strategy-registry';
import {
  TopologyCompiler,
  TopologyBuildResult,
} from '@domain/policy-orchestration/topology-compiler';
import {
  OrchestrationNodeId,
  PolicyNode,
  collectStrategyTopology,
} from '@domain/policy-orchestration';

interface OrchestrationTemplate {
  readonly templateId: string;
  readonly rendered: string;
  readonly variables: readonly string[];
  readonly variablesCount: number;
}

type DependableArtifactId = string | undefined | null;

const asDependsOn = (dependencyId: DependableArtifactId): readonly OrchestrationNodeId[] =>
  typeof dependencyId === 'string' ? [newStudioNodeId(dependencyId)] : [];

const toPolicyNode = (artifact: PolicyStoreArtifact): PolicyNode => ({
  id: newStudioNodeId(artifact.artifactId),
  artifact: {
    id: artifact.artifactId as PolicyNode['artifact']['id'],
    name: artifact.name,
    description: String(artifact.payload?.description ?? artifact.name),
    owner: artifact.namespace,
    target: {
      region: 'global',
      service: artifact.namespace,
      environment: 'prod',
      tags: ['studio'],
    },
    expression: String(artifact.payload?.expression ?? ''),
    severity: 'low',
    state: 'draft',
    mode: 'linear',
    priority: 'P4',
    windows: [],
    version: artifact.revision,
    revision: String(artifact.revision),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  },
  dependsOn: asDependsOn(artifact.payload?.dependsOn as string | undefined),
  retries: 0,
  timeoutSeconds: 2,
  requiresHumanApproval: false,
  ownerTeam: artifact.namespace,
  slaWindowMinutes: 1,
});

export interface UsePolicyStudioOrchestrationState {
  readonly workspace: StudioWorkspace;
  readonly templates: readonly OrchestrationTemplate[];
  readonly queryResult: QueryEngineResult<PolicyStoreArtifact> | null;
  readonly topology: StudioTopology;
  readonly summaryNodes: ReturnType<typeof collectStrategyTopology>;
  readonly telemetryPoints: readonly StudioTelemetryPoint[];
  readonly summary: StudioSummary | null;
  readonly registrySnapshot: StrategyRegistrySnapshot<never> | null;
  readonly lastCommand: StudioCommandId | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export interface UsePolicyStudioOrchestrationActions {
  readonly refresh: () => Promise<void>;
  readonly setMode: (mode: StudioMode) => void;
  readonly setQuery: (query: string) => void;
  readonly runTemplates: (templateIds: NoInfer<readonly string[]>, dryRun: boolean) => Promise<void>;
  readonly toggleNodeSelection: (nodeId: OrchestrationNodeId) => void;
}

const defaultWorkspace: StudioWorkspace = {
  id: 'studio:policy-orchestration',
  orchestratorId: 'policy-console-studio',
  mode: 'observe',
  planId: null,
  selectedNodeIds: [],
  query: '',
  command: {
    commandId: 'studio:init' as StudioCommandId,
    scope: 'global',
    mode: 'observe',
    actor: 'policy-console',
  },
  traces: [],
};

const defaultFilters: PolicyStoreFilters = {
  states: ['active', 'archived', 'retired'],
};

const defaultSort: PolicyStoreSort = {
  key: 'updatedAt',
  order: 'desc',
};

const telemetryPointsFromSummary = (
  windows: readonly { key: string; value: number; unit: string }[],
): readonly StudioTelemetryPoint[] =>
  windows.map((window) => ({
    key: window.key,
    value: window.value,
    runId: `window:${window.unit}`,
  }));

const buildTopology = (
  artifacts: readonly PolicyStoreArtifact[],
  options?: ConstructorParameters<typeof TopologyCompiler>[1],
): TopologyBuildResult => {
  const nodes = artifacts.map(toPolicyNode);

  return new TopologyCompiler(nodes, options).compile();
};

const makeSummary = (queryResult: QueryEngineResult<PolicyStoreArtifact>): StudioSummary => {
  const selected = queryResult.items.slice(0, 5).map((artifact) => ({
    plan: `plan:${artifact.artifactId}` as never,
    revision: artifact.revision,
    runId: newCommandId(`run:${artifact.artifactId}`),
    createdAt: artifact.createdAt,
    selectedTemplate: `template:${artifact.artifactId}` as never,
  }));

  return {
    id: `studio:${queryResult.cursor}`,
    plans: selected,
    nodes: queryResult.items.slice(0, 4).map((artifact) => ({
      nodeId: newStudioNodeId(artifact.artifactId),
      section: toStudioSection('observe'),
      title: artifact.name,
      nodeType: 'artifact',
    })),
  };
};

export function usePolicyStudioOrchestration(): {
  state: UsePolicyStudioOrchestrationState;
  controls: UsePolicyStudioOrchestrationActions;
} {
  const [store] = useState(() => new InMemoryPolicyStore());
  const [orchestrator] = useState(() => new PolicyLabOrchestrator(store, defaultWorkspace.orchestratorId));
  const [registry] = useState(() => new StrategyRegistry([] as const, {
    namespace: 'policy',
    scope: 'scope:policy-console-studio',
    maxHistory: 64,
  }));

  const [state, setState] = useState<UsePolicyStudioOrchestrationState>({
    workspace: defaultWorkspace,
    templates: [],
    queryResult: null,
    topology: { nodes: [], edges: [], groups: [] },
    summaryNodes: [],
    telemetryPoints: [],
    summary: null,
    registrySnapshot: null,
    lastCommand: null,
    isLoading: true,
    error: null,
  });

  const setMode = useCallback((mode: StudioMode) => {
    setState((current) => ({
      ...current,
      workspace: {
        ...current.workspace,
        mode,
        command: asCommand({ mode, actor: current.workspace.command.actor }),
      },
      lastCommand: current.workspace.command.commandId,
    }));
  }, []);

  const setQuery = useCallback((query: string) => {
    setState((current) => ({
      ...current,
      workspace: {
        ...current.workspace,
        query,
      },
    }));
  }, []);

  const toggleNodeSelection = useCallback((nodeId: OrchestrationNodeId) => {
    setState((current) => {
      const selected = current.workspace.selectedNodeIds.includes(nodeId)
        ? current.workspace.selectedNodeIds.filter((entry) => entry !== nodeId)
        : [...current.workspace.selectedNodeIds, nodeId];
      const trace: StudioTrace = {
        commandId: newCommandId(`toggle-${nodeId}`),
        message: `node=${nodeId}`,
        severity: 'info',
      };
      return {
        ...current,
        workspace: {
          ...current.workspace,
          selectedNodeIds: selected,
          traces: [...current.workspace.traces.slice(-40), trace],
        },
      };
    });
  }, []);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const filters: PolicyStoreFilters = {
        ...defaultFilters,
        orchestratorId: state.workspace.orchestratorId,
      };
      const templateSummaries = await orchestrator.listTemplateSummaries(state.workspace.query);
      const templates: OrchestrationTemplate[] = templateSummaries.map((entry) => ({
        templateId: entry.template.id,
        rendered: entry.rendered,
        variables: entry.variables,
        variablesCount: entry.variables.length,
      }));

      const plan = createQueryPlan(filters, defaultSort, 30);
      const queryResult = await executeQueryPlan(store, plan);
      const telemetry = await collectStoreTelemetry(store, state.workspace.orchestratorId);
      const telemetryPoints = telemetryPointsFromSummary(telemetry.windows);
      const events = await collectStoreEventsAsLedger(store, state.workspace.orchestratorId, 24);
      const topology = buildTopology(queryResult.items, { ignoreOrphans: true });
      const summaryNodes = collectStrategyTopology({
        nodes: queryResult.items.map((artifact) => {
          const templateNode = toPolicyNode(artifact);
          return {
            ...templateNode,
            artifact: {
              ...templateNode.artifact,
            description: artifact.artifactId,
            },
          };
        }),
        edges: [],
      });

      const groups = studioSections.map((section) => ({
        section: toStudioSection(section),
        count: topology.waves.length,
      }));
      const topologyUi = {
        nodes: mapTopologyNodes(topology.waves.flatMap((wave) => wave.nodes)),
        edges: topology.waves.flatMap((wave) => wave.edges).map((edge): StudioTopologyEdge => ({
          source: (edge.from as unknown) as OrchestrationNodeId,
          target: (edge.to as unknown) as OrchestrationNodeId,
          label: String(edge.weight),
        })),
        groups,
      };

      const summary = queryResult.items.length > 0 ? makeSummary(queryResult) : null;
      const registrySummary = {
        namespace: 'policy',
        pluginCount: 0,
        activeScopes: ['scope:policy-console-studio'],
        catalog: [] as never,
        runCount: queryResult.items.length,
        traceEnvelope: {
          trace: `trace:${state.workspace.orchestratorId}`,
          createdAt: new Date().toISOString(),
        },
      } as StrategyRegistrySnapshot<never>;

      if (events.ok) {
        const summaryValues = summarizeLedger(events.value);
        void summaryValues;
      }

      if (summaryNodes.length > 0) {
        void summaryNodes;
      }

      const eventFrames = [];
      for await (const event of collectStoreEvents(store, { orchestratorId: state.workspace.orchestratorId })) {
        eventFrames.push(event.runId);
      }

      setState((current) => ({
        ...current,
        queryResult,
        templates,
        telemetryPoints,
        topology: topologyUi,
        summary,
        summaryNodes,
        registrySnapshot: registrySummary,
        workspace: {
          ...current.workspace,
          selectedNodeIds: current.workspace.selectedNodeIds,
          traces: [
            ...current.workspace.traces,
            {
              commandId: newCommandId(`refresh-${state.workspace.orchestratorId}`),
              message: `artifacts=${queryResult.items.length},events=${eventFrames.length}`,
              severity: 'success',
            },
          ],
        },
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'studio refresh failed',
      }));
    }
  }, [orchestrator, state.workspace.orchestratorId, state.workspace.query, store]);

  const runTemplates = useCallback(
    async (templateIds: NoInfer<readonly string[]>, dryRun: boolean) => {
      const command = asCommand({ mode: state.workspace.mode, actor: 'policy-console' });
      setState((current) => ({
        ...current,
        isLoading: true,
        workspace: {
          ...current.workspace,
          command,
          traces: [...current.workspace.traces, {
            commandId: command.commandId,
            message: `run=${templateIds.length}`,
            severity: 'info',
          }],
        },
        lastCommand: command.commandId,
      }));

      const stack = new AsyncDisposableStack();
      await using _ = stack.use({
        [Symbol.asyncDispose]: async () => {
          await Promise.resolve();
        },
      });

      await registry.execute('planner-plugin:policy-console-studio', [], command.commandId, {
        tenantId: 'tenant-studio',
        namespace: 'policy',
        requestId: command.commandId,
        requestedAt: new Date().toISOString(),
        actor: command.actor,
        runId: command.commandId,
        scope: 'planner-plugin:policy-console-studio',
        startedAt: new Date().toISOString(),
        metadata: {
          namespace: 'policy',
          route: `policy.${state.workspace.mode}.run`,
          templateIds,
        },
      });

      try {
        await orchestrator.executeScenarioBatch(templateIds, dryRun, command.actor);
        await refresh();
      } finally {
        await stack.disposeAsync();
        setState((current) => ({ ...current, isLoading: false }));
      }
    },
    [orchestrator, refresh, registry, state.workspace.mode],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    state,
    controls: {
      refresh,
      setMode,
      setQuery,
      runTemplates,
      toggleNodeSelection,
    },
  };
}
