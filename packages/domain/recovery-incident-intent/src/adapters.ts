import {
  type IncidentContext,
  type IncidentIntentManifest,
  type IncidentIntentNode,
  type IncidentIntentPolicy,
  type IncidentIntentRecord,
  type IncidentIntentRoute,
  type IncidentIntentSignal,
  type IncidentIntentStepMetadata,
  type IncidentIntentTuple,
  type IncidentTenantId,
  type IntentNodeId,
  type IncidentIntentMeta,
  type IntentSignalId,
  createIncidentTenantId,
  createIntentRunId,
  createIntentSignalId,
  createIntentStepId,
} from './types';
import { IntentTopologyGraph } from './topology';

interface RawSignal {
  id: string;
  kind: string;
  source: string;
  value: number;
  unit: string;
  observedAt: string;
  labels?: Record<string, string>;
}

interface RawIntent {
  tenantId: string;
  title: string;
  summary: string;
  version: string;
  nodes: ReadonlyArray<{
    id: string;
    kind: string;
    status: string;
    description: string;
    capabilities: readonly string[];
    dependencies: readonly string[];
    createdAt: string;
    updatedAt: string;
    owner: string;
    weight: number;
    metadata?: Record<string, unknown>;
  }>;
  edges: ReadonlyArray<{ from: string; to: string; reason: string; precedence: number }>;
  context: {
    tenantId: string;
    incidentId: string;
    startedAt: string;
    affectedSystems: readonly string[];
    severity: 'p1' | 'p2' | 'p3' | 'p4';
    tags: readonly string[];
    meta: {
      owner: string;
      region: string;
      team: string;
    };
  };
}

const asNodeId = (value: string): IntentNodeId => value as IntentNodeId;

const toNodeKind = (kind: string): IncidentIntentNode['kind'] => {
  if (kind === 'collect' || kind === 'infer' || kind === 'synthesize' || kind === 'mitigate' || kind === 'validate' || kind === 'verify') {
    return kind;
  }
  return 'collect';
}

export const toIntentNode = (raw: RawIntent['nodes'][number]): IncidentIntentNode => ({
  id: asNodeId(raw.id),
  kind: toNodeKind(raw.kind),
  phase: 'input',
  status: raw.status as IncidentIntentNode['status'],
  description: raw.description,
  weight: raw.weight,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  meta: {
    owner: raw.owner,
    capabilities: [...raw.capabilities],
    dependencies: raw.dependencies.map(asNodeId),
  },
});

export const toTopology = (nodes: readonly IncidentIntentNode[]): IntentTopologyGraph => {
  const edges = nodes.flatMap((node) =>
    node.meta.dependencies.map((dependency, index) => ({
      from: dependency,
      to: node.id,
      reason: `${node.meta.owner}:${node.phase}`,
      precedence: index + 1,
      weight: 1,
      payload: { capacity: node.weight },
    })),
  );

  return new IntentTopologyGraph({
    tenantId: createIncidentTenantId('tenant-default'),
    runId: createIntentRunId('bootstrap'),
    nodes,
    edges: edges,
  });
};

export const normalizeSignals = (signals: readonly RawSignal[]): readonly IncidentIntentSignal[] =>
  signals
    .filter((signal) => signal.kind !== '')
    .map((signal) => ({
      id: createIntentSignalId(signal.id),
      kind: (signal.kind === 'manual' || signal.kind === 'log' || signal.kind === 'sli' || signal.kind === 'telemetry')
        ? (signal.kind as IncidentIntentSignal['kind'])
        : 'telemetry',
      source: signal.source,
      value: signal.value,
      unit: signal.unit,
      observedAt: signal.observedAt,
      labels: signal.labels ?? {},
    }));

export const hydrateManifest = (raw: RawIntent): IncidentIntentRecord => {
  const topology = toTopology(raw.nodes.map((node) => toIntentNode(node)));
  const route: IncidentIntentRoute = {
    runId: createIntentRunId('route'),
    tenantId: createIncidentTenantId(raw.tenantId),
    steps: [],
  };

  const context: IncidentContext = {
    tenantId: createIncidentTenantId(raw.context.tenantId),
    incidentId: raw.context.incidentId,
    startedAt: raw.context.startedAt,
    affectedSystems: [...raw.context.affectedSystems],
    severity: raw.context.severity,
    tags: [...raw.context.tags],
    meta: {
      ...(raw.context.meta as IncidentIntentMeta),
      tenantId: createIncidentTenantId(raw.context.tenantId),
    },
  };

  return {
    catalogId: `${raw.title.toLowerCase().replace(/\s+/g, '-')}` as IncidentIntentRecord['catalogId'],
    tenantId: createIncidentTenantId(raw.tenantId),
    title: raw.title,
    summary: raw.summary,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    nodes: [...topology.getNodes(), ...raw.nodes.map((entry) => toIntentNode(entry))],
    edges: topology.getSnapshot().cycles.map((nodeId) => ({
      from: nodeId,
      to: nodeId,
      reason: 'cycle',
      precedence: 1,
      weight: 1,
      payload: { cycle: true },
    })),
    context,
    manifestType: 'incident-intent',
    route,
  };
};

export const toRecord = (manifest: IncidentIntentManifest): IncidentIntentRecord => ({
  ...manifest,
  manifestType: 'incident-intent',
});

export const adaptSignalsTuple = <T extends readonly IncidentIntentSignal[]>(
  tuple: T,
): IncidentIntentTuple<T> => [...tuple] as unknown as IncidentIntentTuple<T>;

export const manifestFromTuple = (
  title: string,
  inputs: readonly [IncidentContext, ...IncidentIntentSignal[]],
): IncidentIntentRecord => {
  const [context, ...signals] = inputs;
  const nodes: IncidentIntentNode[] = context.affectedSystems.map((system, index) => {
    const signal = signals[index] as IncidentIntentSignal;
    return {
      id: `node-${signal?.id ?? index}` as unknown as IntentNodeId,
      kind: index % 2 === 0 ? 'collect' : 'infer',
      phase: 'analysis',
      status: 'queued',
      description: `signal:${system}`,
      weight: index + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      meta: {
        owner: context.meta.owner,
        capabilities: [signal?.kind ?? 'telemetry'],
        dependencies: [],
      },
    };
  });

  return {
    catalogId: `generated-${title.toLowerCase().replace(/\s+/g, '-')}` as IncidentIntentRecord['catalogId'],
    tenantId: context.tenantId,
    title,
    summary: `${title}(${context.tenantId})`,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    nodes,
    edges: [],
    context,
    manifestType: 'incident-intent',
  };
};

export const policyRouteSteps = (
  policies: readonly IncidentIntentPolicy[],
): IncidentIntentRecord['route'] => {
  return {
    runId: createIntentRunId('policy-route'),
    tenantId: 'tenant-default' as IncidentTenantId,
    steps: policies.map((policy, index) => ({
      stepId: createIntentStepId(policy.policyId as string, index),
      path: `${policy.title}`,
      weight: policy.weight.severity + policy.weight.confidence,
      latencyMs: policy.tags.length * 10,
      labels: { source: 'policy', title: policy.title },
    })),
  };
};

export const toMetaTuple = <T extends readonly IncidentIntentMeta[]>(
  values: T,
): IncidentIntentTuple<T> => [...values] as unknown as IncidentIntentTuple<T>;

export const adaptSignalMetadata = <T extends readonly IncidentIntentStepMetadata[]>(
  metadata: T,
): T => metadata.map((entry) => ({
  ...entry,
  path: entry.path,
  labels: { ...entry.labels },
})) as unknown as T;
