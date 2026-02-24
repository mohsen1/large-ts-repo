import { summarizeArtifacts, emitStoreMetrics, summarizeRuns } from '@data/policy-orchestration-store/metrics';
import { InMemoryPolicyStore, PolicyStoreArtifact, PolicyStoreRunRecord } from '@data/policy-orchestration-store';
import {
  AnyPolicyPlugin,
  createPluginManifest,
  matchesFilter,
  PolicyPlugin,
  PolicyPluginContext,
  PolicyPluginRegistry,
  PolicyPluginScope,
  PolicyPluginTraceId,
  policyPluginId,
  policyPluginTrace,
  policyPluginVersion,
} from '@domain/policy-orchestration/plugin-framework';
import { PolicyNode, PolicyPlan, PolicySimulationResult, runPlanSimulation } from '@domain/policy-orchestration';
import { OrchestrationWorkspace, RunRequest, PolicyOrchestrationRunner } from './orchestrator';

export interface PolicyPluginEnvelope {
  readonly runId: string;
  readonly traceId: PolicyPluginTraceId;
  readonly orchestratorId: string;
  readonly workspace: OrchestrationWorkspace;
  readonly runOutcomeRunId: string;
  readonly summary: {
    artifactCount: number;
    activeArtifactCount: number;
    successfulRuns: number;
    metrics: readonly number[];
  };
  readonly runSnapshots: readonly PolicyStoreRunRecord[];
  readonly pluginLog: readonly string[];
  readonly runTelemetry: string;
}

export interface PluginRunnerConfig {
  readonly store?: InMemoryPolicyStore;
  readonly plugins?: readonly AnyPolicyPlugin[];
}

export type PolicyEnvelopePlugin = PolicyPlugin<
  'timing' | 'report' | 'artifact' | 'quality',
  'telemetry-plugin',
  PolicyPluginEnvelope,
  PolicyPluginEnvelope,
  readonly ['plan'],
  readonly ['plan']
>;

const scopeForRequest = (workspace: OrchestrationWorkspace, request: RunRequest): PolicyPluginScope => {
  if (workspace.contract.service.includes('policy')) {
    return request.dryRun
      ? ('simulator-plugin:' + workspace.orchestratorId as PolicyPluginScope)
      : ('planner-plugin:' + workspace.orchestratorId as PolicyPluginScope);
  }

  return request.dryRun
    ? ('executor-plugin:' + workspace.orchestratorId as PolicyPluginScope)
    : ('telemetry-plugin:' + workspace.orchestratorId as PolicyPluginScope);
};

const namespaceFromScope = (scope: PolicyPluginScope): string => scope.split(':')[0] ?? '';

const simulatePlan = (workspace: OrchestrationWorkspace): PolicySimulationResult[] => {
  if (workspace.nodes.length === 0) {
    return [];
  }

  const plan: PolicyPlan = {
    id: `${workspace.orchestratorId}:meta` as PolicyPlan['id'],
    orchestrator: workspace.orchestratorId as PolicyPlan['orchestrator'],
    steps: [
      {
        batchId: 'bootstrap' as PolicyPlan['steps'][number]['batchId'],
        nodeIds: workspace.nodes.map((node) => node.id),
        order: 0,
        maxConcurrency: 1,
        estimatedLatencyMs: workspace.nodes.length * 40,
      },
    ],
    createdAt: new Date().toISOString(),
    state: 'draft',
    revision: 1,
  };

  const nodeMap = new Map<PolicyNode['id'], PolicyNode>(workspace.nodes.map((node) => [node.id, node]));
  const contexts = workspace.nodes.map((node) => ({
    principal: node.ownerTeam,
    resource: node.artifact.target.service,
    action: 'simulate',
    attributes: {
      artifactId: node.artifact.id,
      principalTeam: node.ownerTeam,
      timeoutMs: node.timeoutSeconds * 1000,
      namespace: workspace.orchestratorId,
    },
    now: new Date().toISOString(),
  }));

  return runPlanSimulation({
    plan,
    nodes: nodeMap,
    contexts,
    dryRunLabel: 'warmup',
  });
};

const basePlugins = [
  {
    ...createPluginManifest('timing', 'telemetry-plugin', '1.0.0', 'telemetry-plugin:timing'),
    version: policyPluginVersion('1.0.0'),
    consumes: ['plan'],
    emits: ['plan'],
    pluginId: policyPluginId('timing:telemetry:1.0.0'),
    async run(envelope: PolicyPluginEnvelope): Promise<PolicyPluginEnvelope> {
      const timeline = emitStoreMetrics([], []);
      return {
        ...envelope,
        summary: {
          ...envelope.summary,
          metrics: timeline.map((entry) => entry.value),
        },
        runTelemetry: `timing=${timeline.length};run=${envelope.runId}`,
        pluginLog: [...envelope.pluginLog, `timing:${timeline.length}`],
      };
    },
  },
  {
    ...createPluginManifest('artifact', 'telemetry-plugin', '1.0.0', 'telemetry-plugin:artifact'),
    version: policyPluginVersion('1.0.0'),
    consumes: ['plan'],
    emits: ['plan'],
    pluginId: policyPluginId('artifact:telemetry:1.0.0'),
    async run(envelope: PolicyPluginEnvelope): Promise<PolicyPluginEnvelope> {
      const artifactNames = envelope.summary.artifactCount
        ? `${envelope.summary.artifactCount} artifacts`
        : 'no artifacts';
      return {
        ...envelope,
        pluginLog: [...envelope.pluginLog, `artifact:${artifactNames}`],
      };
    },
  },
  {
    ...createPluginManifest('quality', 'telemetry-plugin', '1.0.0', 'telemetry-plugin:quality'),
    version: policyPluginVersion('1.0.0'),
    consumes: ['plan'],
    emits: ['plan'],
    pluginId: policyPluginId('quality:telemetry:1.0.0'),
    async run(envelope: PolicyPluginEnvelope): Promise<PolicyPluginEnvelope> {
      const successRate = envelope.summary.successfulRuns > 0
        ? Math.min(100, envelope.summary.successfulRuns * 5)
        : 0;
      return {
        ...envelope,
        pluginLog: [...envelope.pluginLog, `quality:${successRate.toFixed(1)}%`],
      };
    },
  },
  {
    ...createPluginManifest('report', 'telemetry-plugin', '1.0.0', 'telemetry-plugin:report'),
    version: policyPluginVersion('1.0.0'),
    consumes: ['plan'],
    emits: ['plan'],
    pluginId: policyPluginId('report:telemetry:1.0.0'),
    async run(envelope: PolicyPluginEnvelope): Promise<PolicyPluginEnvelope> {
      const trace = envelope.runTelemetry.length === 0 ? 'empty' : envelope.runTelemetry.slice(0, 80);
      return {
        ...envelope,
        pluginLog: [...envelope.pluginLog, `report:${trace}`],
      };
    },
  },
] as const satisfies readonly PolicyEnvelopePlugin[];

const pluginCatalog = [...basePlugins] as readonly PolicyEnvelopePlugin[];
const scopedPlugins = new PolicyPluginRegistry(pluginCatalog);

const createWorkspaceSnapshot = (
  runId: string,
  workspace: OrchestrationWorkspace,
  request: RunRequest,
  artifacts: readonly PolicyStoreArtifact[],
  runSnapshots: readonly PolicyStoreRunRecord[],
): PolicyPluginEnvelope => {
  const artifactsSummary = summarizeArtifacts(artifacts);
  const runSummary = summarizeRuns(runSnapshots);
  const simulation = simulatePlan(workspace);

  return {
    runId,
    traceId: policyPluginTrace(runId),
    orchestratorId: workspace.orchestratorId,
    workspace,
    runOutcomeRunId: runId,
    summary: {
      artifactCount: artifactsSummary.totalArtifacts,
      activeArtifactCount: artifactsSummary.activeArtifacts,
      successfulRuns: simulation.length + runSummary.activeArtifacts,
      metrics: simulation.map((entry) => entry.p95LatencyMs),
    },
    runSnapshots,
    pluginLog: [
      `request.dryRun=${request.dryRun}`,
      `nodes=${workspace.nodes.length}`,
      `artifactState=${artifactsSummary.totalArtifacts}`,
      `windows=${workspace.windows.length}`,
    ],
    runTelemetry: `${runId}::${workspace.orchestratorId}`,
  };
};

class PluginScopeTracker {
  #steps = 0;

  public constructor(
    public readonly runId: string,
    public readonly startedAt: string,
  ) {}

  public markStep(): void {
    this.#steps += 1;
  }

  public get steps(): number {
    return this.#steps;
  }

  public [Symbol.dispose](): void {
    this.#steps = 0;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.#steps = -1;
  }
}

export const getDefaultPluginsByNamespace = (namespace: string): readonly PolicyEnvelopePlugin[] => {
  const normalized = namespace.trim().toLowerCase();
  if (!normalized) return pluginCatalog;

  return pluginCatalog.filter((plugin) => {
    const scopeDomain = namespaceFromScope((plugin.scope as string).toLowerCase() as PolicyPluginScope);
    return scopeDomain.includes(normalized);
  });
};

export const runPolicyWorkspaceWithPlugins = async (
  workspace: OrchestrationWorkspace,
  request: RunRequest,
  config: PluginRunnerConfig = {},
): Promise<PolicyPluginEnvelope> => {
  const store = config.store ?? new InMemoryPolicyStore();
  const runner = new PolicyOrchestrationRunner(store);
  using _ = new PluginScopeTracker(policyPluginTrace(workspace.orchestratorId), new Date().toISOString());
  const stack = new AsyncDisposableStack();
  const scope = scopeForRequest(workspace, request);

  const candidatePlugins = scopedPlugins.list({ scopes: [scope] });
  const fallbackPlugins = config.plugins ?? pluginCatalog;
  const selectedPlugins = candidatePlugins.length > 0 ? candidatePlugins : fallbackPlugins;
  const matchingPlugins = selectedPlugins.filter((candidate) =>
    matchesFilter(candidate, {
      kind: candidate.kind,
      scopes: [scope],
      names: [candidate.name],
    }),
  );
  const pluginChain = matchingPlugins.length > 0 ? matchingPlugins : selectedPlugins;

  await using runtimeScope = stack.use(new PluginScopeTracker(workspace.orchestratorId, new Date().toISOString()));
  runtimeScope.markStep();

  const runOutcome = await runner.run(workspace, request);
  const artifacts = await store.searchArtifacts({ orchestratorId: workspace.orchestratorId }, { key: 'updatedAt', order: 'desc' });
  const runSnapshots = await store.searchRuns(workspace.orchestratorId);

  const envelopeSeed = createWorkspaceSnapshot(
    runOutcome.runId,
    workspace,
    request,
    artifacts,
    runSnapshots,
  );

  const pluginNames = pluginChain.map((plugin) => plugin.name);
  const context: PolicyPluginContext = {
    tenantId: workspace.contract.service,
    orchestratorId: workspace.orchestratorId,
    runId: runOutcome.runId,
    scope,
    startedAt: runOutcome.storage.runs.at(0)?.updatedAt ?? new Date().toISOString(),
    metadata: {
      runType: request.dryRun ? 'dry-run' : 'live-run',
      nodes: String(workspace.nodes.length),
      scope,
      pluginNames,
    },
  };

  const outcome = await scopedPlugins.execute<PolicyPluginEnvelope>(
    pluginChain,
    envelopeSeed,
    context,
  );

  return {
    ...outcome,
    pluginLog: [...outcome.pluginLog, `scope=${scope}`, ...pluginNames.map((name) => `loaded=${name}`)],
  };
};

export const getPluginCatalog = (): readonly AnyPolicyPlugin[] => [...pluginCatalog];
