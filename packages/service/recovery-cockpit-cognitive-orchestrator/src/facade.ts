import { NoInfer } from '@shared/type-level';
import {
  WorkflowGraph,
  buildWorkflowPath,
  workflowStages,
  type CockpitPluginManifest,
  type PluginScope,
  type SignalLayer,
  type SignalRunId,
  type AnySignalEnvelope,
  type WorkflowTemplate,
  coerceRunId,
  signalLayers,
  type WorkflowNode,
} from '@domain/recovery-cockpit-cognitive-core';
import { CockpitPluginRegistry, type PluginExecutionContext } from '@domain/recovery-cockpit-cognitive-core';
import type { SignalQuery, WorkspaceState } from '@data/recovery-cockpit-cognitive-store';
import { CognitiveSignalStore } from '@data/recovery-cockpit-cognitive-store';
import { buildDashboardRows } from './adapters';

type AsyncDisposer = {
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

type StackCtor = new () => AsyncDisposer;
const createAsyncScope = (): AsyncDisposer => {
  const Ctor = (globalThis as unknown as { AsyncDisposableStack?: StackCtor }).AsyncDisposableStack;
  if (Ctor) {
    return new Ctor();
  }
  return {
    [Symbol.dispose]: () => {},
    [Symbol.asyncDispose]: async () => {},
  };
};

type RawPlugin = CockpitPluginManifest<string, PluginScope, unknown, unknown>;
type PluginPayload = Record<string, unknown>;

const defaultPlugins = [
  {
    id: 'plugin:baseline',
    scope: 'ingest',
    name: 'baseline',
    channels: ['ingest::live'],
    enabled: true,
    layers: ['readiness'],
    metadata: { mode: 'default' },
    execute: async (input: unknown, _context: PluginExecutionContext) => ({
      accepted: true,
      output: input,
      warnings: [],
      latencyMs: 0,
      executedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'plugin:risk-scorer',
    scope: 'score',
    name: 'risk-scorer',
    channels: ['score::runtime'],
    enabled: true,
    layers: ['drift', 'capacity'],
    metadata: { mode: 'default' },
    execute: async (input: PluginPayload) => ({
      accepted: true,
      output: {
        ...input,
        scored: true,
      },
      warnings: [],
      latencyMs: 0,
      executedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'plugin:forecast',
    scope: 'forecast',
    name: 'forecast',
    channels: ['forecast::runtime'],
    enabled: true,
    layers: ['continuity'],
    metadata: { mode: 'default' },
    execute: async (input: PluginPayload) => ({
      accepted: true,
      output: {
        ...input,
        forecastReady: true,
      },
      warnings: ['forecast uses sampled model'],
      latencyMs: 0,
      executedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'plugin:route',
    scope: 'route',
    name: 'route',
    channels: ['route::runtime'],
    enabled: true,
    layers: ['policy', 'anomaly'],
    metadata: { mode: 'default' },
    execute: async (input: PluginPayload) => ({
      accepted: true,
      output: {
        ...input,
        routed: true,
      },
      warnings: [],
      latencyMs: 0,
      executedAt: new Date().toISOString(),
    }),
  },
] as const satisfies readonly RawPlugin[];

const registry = new CockpitPluginRegistry<readonly RawPlugin[]>(defaultPlugins as readonly RawPlugin[]);

const defaultNodes: readonly WorkflowNode[] = [
  {
    id: 'cockpit-readiness:ingest',
    stage: 'ingest',
    label: 'Ingest cockpit signal',
    pluginScope: 'ingest',
    inputType: 'AnySignalEnvelope[]',
    outputType: 'AnySignalEnvelope[]',
    defaultPriority: 'medium',
    allowedLayers: ['readiness', 'continuity'],
    payload: {
      note: 'ingest entry',
    },
  },
  {
    id: 'cockpit-readiness:evaluate',
    stage: 'evaluate',
    label: 'Evaluate score',
    pluginScope: 'score',
    inputType: 'AnySignalEnvelope[]',
    outputType: 'AnySignalEnvelope[]',
    defaultPriority: 'high',
    allowedLayers: ['drift'],
    payload: {
      note: 'evaluate entry',
    },
  },
  {
    id: 'cockpit-readiness:simulate',
    stage: 'simulate',
    label: 'Simulate recovery',
    pluginScope: 'forecast',
    inputType: 'AnySignalEnvelope[]',
    outputType: 'AnySignalEnvelope[]',
    defaultPriority: 'high',
    allowedLayers: ['continuity'],
    payload: {
      note: 'simulate entry',
    },
  },
] as const;

const defaultTemplate = {
  id: 'cockpit::workflow',
  name: 'cognitive-control',
  revision: 1,
  nodes: defaultNodes,
  edges: [
    {
      from: 'cockpit-readiness:ingest',
      to: 'cockpit-readiness:evaluate',
      reason: 'default transition',
    },
    {
      from: 'cockpit-readiness:evaluate',
      to: 'cockpit-readiness:simulate',
      reason: 'default transition',
    },
  ],
  createdAt: new Date().toISOString(),
  labels: {
    mode: 'default',
    stageCount: String(defaultNodes.length),
  },
} as const satisfies WorkflowTemplate;

const workflow = new WorkflowGraph(defaultTemplate);
const storeByWorkspace = new Map<string, CognitiveSignalStore>();

type OrchestratorEvent = {
  readonly runId: SignalRunId;
  readonly pluginId: string;
  readonly stage: PluginScope;
  readonly accepted: boolean;
  readonly warnings: readonly string[];
  readonly latencyMs: number;
};

type OrchestratorRunOutput = {
  readonly runId: SignalRunId;
  readonly snapshot: WorkspaceState;
  readonly workflowPath: string;
  readonly events: readonly OrchestratorEvent[];
  readonly outputCount: number;
};

export interface OrchestratorInput {
  readonly tenantId: string;
  readonly workspaceId: string;
}

export interface OrchestratorSubmission {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly runId?: SignalRunId;
  readonly signals: readonly AnySignalEnvelope[];
}

const resolveStore = (tenantId: string, workspaceId: string): CognitiveSignalStore => {
  const key = `${tenantId}:${workspaceId}`;
  const existing = storeByWorkspace.get(key);
  if (existing) {
    return existing;
  }
  const created = new CognitiveSignalStore();
  storeByWorkspace.set(key, created);
  return created;
};

const buildQuery = (input: OrchestratorInput): SignalQuery => ({
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  sortByAt: 'desc',
});

export const ingestSignals = async ({
  tenantId,
  workspaceId,
  runId,
  signals,
}: OrchestratorSubmission): Promise<void> => {
  const store = resolveStore(tenantId, workspaceId);
  const runIdentifier = runId ?? coerceRunId(`${tenantId}:${workspaceId}:${Date.now()}`);
  for (const signal of signals) {
    await store.save({
      ...signal,
      runId: runIdentifier,
      acceptedAt: new Date().toISOString(),
    });
  }
};

export const runCognitiveWorkflow = async (input: OrchestratorInput): Promise<OrchestratorRunOutput> => {
  const store = resolveStore(input.tenantId, input.workspaceId);
  const snapshot = await store.state(buildQuery(input));
  const runId = coerceRunId(`${input.tenantId}:${input.workspaceId}:${Date.now()}`);
  const context: PluginExecutionContext = {
    runId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actor: 'cockpit-cognitive-runtime',
    triggeredAt: new Date().toISOString(),
    tags: {
      workspace: input.workspaceId,
    },
  };

  const eventSink: OrchestratorEvent[] = [];
  const stages = workflow.topologicalOrder();
  for (const stageNodeId of stages) {
    const stageNode = workflow.findNode(stageNodeId);
    if (!stageNode) {
      continue;
    }
    const plugins = registry.byScope(stageNode.pluginScope);
    const allowedLayers = new Set(stageNode.allowedLayers);
    const snapshotSignals = snapshot.signals as readonly AnySignalEnvelope[];
    const inputs = snapshotSignals
      .filter((signal: AnySignalEnvelope) => allowedLayers.has(signal.layer))
      .map((signal: AnySignalEnvelope) => ({ signal, stage: stageNode.id }));

    for (const plugin of plugins) {
      const result = await plugin.execute(inputs, context);
      eventSink.push({
        runId,
        pluginId: plugin.id,
        stage: plugin.scope,
        accepted: result.accepted,
        warnings: result.warnings,
        latencyMs: result.latencyMs,
      });
    }
  }

  void buildDashboardRows(runId, eventSink);
  return {
    runId,
    snapshot,
    workflowPath: buildWorkflowPath(workflow.nodes),
    events: eventSink.toSorted((left, right) => left.latencyMs - right.latencyMs),
    outputCount: eventSink.length,
  };
};

export const collectSignals = async (input: OrchestratorInput): Promise<readonly AnySignalEnvelope[]> => {
  const store = resolveStore(input.tenantId, input.workspaceId);
  const query = buildQuery(input);
  return await store.query(query);
};

export interface WorkspaceSummary {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly byLayer: Readonly<Record<SignalLayer, number>>;
  readonly total: number;
  readonly latest: string;
}

export const summarizeWorkspace = async (input: OrchestratorInput): Promise<WorkspaceSummary> => {
  const store = resolveStore(input.tenantId, input.workspaceId);
  const snapshot = await store.state(buildQuery(input));
  const byLayer = signalLayers.reduce(
    (acc, layer) => {
      const snapshotSignals = snapshot.signals as readonly AnySignalEnvelope[];
      const count = snapshotSignals.filter((signal) => signal.layer === layer).length;
      acc[layer] = count;
      return acc;
    },
    {} as Record<SignalLayer, number>,
  );

  return {
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    byLayer,
    total: snapshot.signals.length,
    latest: snapshot.stats.lastUpdated,
  };
};

export const disposeWorkspaceStore = async (input: OrchestratorInput): Promise<void> => {
  const key = `${input.tenantId}:${input.workspaceId}`;
  const store = storeByWorkspace.get(key);
  if (!store) {
    return;
  }

  await using _scope = createAsyncScope();
  await store[Symbol.asyncDispose]();
  storeByWorkspace.delete(key);
};

export const __workflowStages = workflowStages;
export const __inferDashboardRows = (runId: SignalRunId, events: readonly OrchestratorEvent[]) =>
  buildDashboardRows(runId, events);

export type { AnySignalEnvelope, SignalRunId, SignalLayer };
