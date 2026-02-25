import { iteratorChain } from '@shared/recovery-workbench-runtime';
import {
  bootstrapSnapshot,
  bootstrapIntentionId,
  topologicalOrder,
  scoreGraph,
  type IntentGraphSnapshot,
  type IntentNodeDef,
  walkSnapshot,
  getIncomingByNode,
  getOutgoingByNode,
  type IntentOutput,
  type IntentSignal,
  makeIntentTenant,
  makeIntentWorkspace,
  type IntentInput,
} from '@shared/recovery-intent-graph-runtime';
import type { IntentRoute } from '../types';
import { intentRouteUnion, toIntentEdges, toIntentNodeRows, toWorkspaceSummary } from '../types';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export interface ServiceConfig {
  readonly tenant: string;
  readonly workspace: string;
  readonly route: IntentRoute;
  readonly throttleMs: number;
}

export interface ServiceSignal {
  readonly tenant: IntentSignal['tenant'];
  readonly workspace: IntentSignal['workspace'];
  readonly eventType: string;
  readonly confidence: number;
  readonly metadata: Record<string, string | number | boolean>;
}

export interface WorkspaceSummary {
  readonly route: string;
  readonly routeNodes: number;
  readonly routeEdges: number;
  readonly score: number;
  readonly topologicalDepth: number;
}

export interface WorkspaceIntentRequest {
  readonly config: ServiceConfig;
  readonly graph?: IntentGraphSnapshot<unknown>;
}

const phaseSignals = (route: IntentRoute): readonly ServiceSignal[] => [
  {
    tenant: makeIntentTenant('tenant/default'),
    workspace: makeIntentWorkspace('workspace/default'),
    eventType: `${route}:entered`,
    confidence: 0.82,
    metadata: { route, intention: bootstrapIntentionId },
  },
  {
    tenant: makeIntentTenant('tenant/default'),
    workspace: makeIntentWorkspace('workspace/default'),
    eventType: `${route}:validated`,
    confidence: 0.91,
    metadata: { route, intention: bootstrapIntentionId },
  },
];

type IntentRequestPayload = {
  readonly route: IntentRoute;
  readonly requestedAt: string;
};

const syntheticInput = (route: IntentRoute): IntentInput<IntentRequestPayload, typeof route> => ({
  kind: route,
  payload: {
    route,
    requestedAt: new Date().toISOString(),
  },
});

const normalizeSignals = (route: string, tenant: string, workspace: string): readonly ServiceSignal[] =>
  phaseSignals(route as IntentRoute).map((signal, index) => ({
    ...signal,
    tenant: makeIntentTenant(tenant),
    workspace: makeIntentWorkspace(workspace),
    confidence: Math.min(1, signal.confidence + index * 0.01),
  }));

const summarizePlugins = (
  nodes: readonly IntentNodeDef[],
): readonly { name: string; route: string; latencyMs: number; canRun: boolean }[] =>
  nodes.slice(0, 12).map((node, index) => ({
    name: node.title,
    route: node.kind,
    latencyMs: (index + 1) * 11,
    canRun: node.score >= 0,
  }));

export const workspaceSummary = (graph: IntentGraphSnapshot<unknown>): WorkspaceSummary => {
  const topology = topologicalOrder(graph);
  const summary = toWorkspaceSummary(graph);
  return {
    ...summary,
    topologicalDepth: topology.length,
  };
};

export const normalizeGraph = (graph: IntentGraphSnapshot<unknown>): {
  readonly route: string;
  readonly nodes: ReturnType<typeof toIntentNodeRows>;
  readonly edges: ReturnType<typeof toIntentEdges>;
  readonly signals: readonly ServiceSignal[];
  readonly plugins: readonly { name: string; route: string; latencyMs: number; canRun: boolean }[];
} => {
  const incoming = getIncomingByNode(graph);
  const outgoing = getOutgoingByNode(graph);
  const nodes = toIntentNodeRows(graph);
  const edges = toIntentEdges(graph);
  const pluginSummaries = summarizePlugins(graph.nodes);

  const routeSignals = iteratorChain(Object.keys(incoming)).map((nodeId) => ({
    tenant: makeIntentTenant((graph.tags.tenant ?? 'tenant/default') as string),
    workspace: makeIntentWorkspace((graph.tags.workspace ?? 'workspace/default') as string),
    eventType: 'inbound',
    confidence: incoming[nodeId as keyof typeof incoming]?.length ?? 0,
    metadata: {
      nodeId,
      fanIn: (incoming[nodeId as keyof typeof incoming]?.length ?? 0),
      fanOut: (outgoing[nodeId as keyof typeof outgoing]?.length ?? 0),
    },
  }));

  return {
    route: graph.tags.route ?? graph.name,
    nodes,
    edges,
    signals: routeSignals.toArray(),
    plugins: pluginSummaries.map((plugin) => ({
      name: plugin.name,
      route: plugin.route,
      latencyMs: plugin.latencyMs,
      canRun: plugin.canRun,
    })),
  };
};

export const normalizeWorkspaceRoute = (input: string): IntentRoute =>
  intentRouteUnion.includes(input as IntentRoute) ? (input as IntentRoute) : intentRouteUnion[0];

export const loadWorkspace = async ({
  config,
  graph = bootstrapSnapshot,
}: WorkspaceIntentRequest): Promise<{
  readonly summary: WorkspaceSummary;
  readonly snapshot: IntentGraphSnapshot<unknown>;
  readonly signals: readonly ServiceSignal[];
  readonly routeState: ReturnType<typeof normalizeGraph>;
  readonly workspace: {
    readonly tenant: string;
    readonly workspace: string;
    readonly route: IntentRoute;
    readonly score: number;
  };
}> => {
  const snapshot = graph as IntentGraphSnapshot<unknown>;
  const normalizedRoute = normalizeWorkspaceRoute(config.route);
  const summary = workspaceSummary(snapshot);
  const routeState = normalizeGraph(snapshot);

  return {
    summary,
    snapshot,
    signals: normalizeSignals(normalizedRoute, config.tenant, config.workspace),
    routeState,
    workspace: {
      tenant: config.tenant,
      workspace: config.workspace,
      route: normalizedRoute,
      score: summary.score,
    },
  };
};

export const listDefaultPlugins = (): readonly string[] => [
  'bootstrap-plugin',
  'classify-plugin',
  'resolution-plugin',
  'observe-plugin',
];

const fallbackGraph = (route: IntentRoute): IntentGraphSnapshot<unknown> => ({
  name: `fallback-${route}`,
  nodes: [],
  edges: [],
  tags: {
    route,
    tenant: 'tenant/default',
    workspace: 'workspace/default',
    score: '0',
  },
});

const normalizeOutputSignals = (
  routeInput: IntentInput<IntentRequestPayload, IntentRoute>,
  contextTenant: string,
  contextWorkspace: string,
): readonly ServiceSignal[] =>
  iteratorChain(phaseSignals(routeInput.payload.route)).map((signal, index) => ({
    ...signal,
    tenant: makeIntentTenant(contextTenant),
    workspace: makeIntentWorkspace(contextWorkspace),
    metadata: {
      ...signal.metadata,
      index,
      generated: true,
    },
    confidence: Math.min(1, signal.confidence + index * 0.03),
  })).toArray();

export const executeGraph = async (
  config: ServiceConfig,
  snapshot: IntentGraphSnapshot<unknown>,
): Promise<IntentOutput<IntentGraphSnapshot<unknown>>> => {
  const request = syntheticInput(config.route);
  const baseSnapshot = snapshot.nodes.length === 0 ? fallbackGraph(config.route) : snapshot;
  const signalCount = request.payload.route.toString().length;
  const delayMs = Math.min(250, signalCount * 12);

  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const score = scoreGraph(baseSnapshot);

  return {
    output: baseSnapshot,
    emittedSignals: normalizeOutputSignals(request, config.tenant, config.workspace).map((signal): IntentSignal => ({
      tenant: signal.tenant,
      workspace: signal.workspace,
      eventType: signal.eventType,
      confidence: signal.confidence,
      metadata: {
        ...signal.metadata,
        scored: score,
      },
    })),
    runtimeMs: Math.max(16, delayMs * 2),
  };
};

export const ensureWorkspaceState = (tenant: string, workspace: string, route: IntentRoute) => ({
  tenant,
  workspace,
  route,
});

export const pluginTemplates = intentRouteUnion.map((route) => ({
  route,
  name: `template-${route.replace(':', '-')}`,
  throttle: 250,
}));
