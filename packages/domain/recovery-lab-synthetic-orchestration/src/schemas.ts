import {
  type GraphEdge,
  type GraphNode,
  type GraphRunId,
  type GraphStep,
  makeEdgeId,
  makeNodeId,
  makeRunId,
  type WorkflowBlueprint,
} from './models.js';

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

interface BlueprintNodeInput {
  readonly id: string;
  readonly type: 'source' | 'transform' | 'merge' | 'sink';
  readonly route: string;
  readonly tags: readonly string[];
}

interface BlueprintEdgeInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly latencyMs: number;
  readonly weight: number;
}

interface BlueprintStepInput {
  readonly id: string;
  readonly name: string;
  readonly phase: string;
  readonly node: string;
  readonly intensity: 'calm' | 'elevated' | 'extreme';
  readonly plugin: string;
  readonly estimatedMs: number;
}

export interface BlueprintDocument {
  readonly id: string;
  readonly tenant: string;
  readonly namespace: string;
  readonly createdAt: string;
  readonly nodes: readonly BlueprintNodeInput[];
  readonly edges: readonly BlueprintEdgeInput[];
  readonly steps: readonly BlueprintStepInput[];
  readonly metadata?: {
    readonly version: number;
    readonly channel: string;
  };
}

export interface BlueprintInput {
  readonly id: string;
  readonly tenant: string;
  readonly namespace: string;
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly steps: readonly unknown[];
}

const normalizeNode = (node: unknown): node is BlueprintNodeInput =>
  isObject(node) &&
  isString(node.id) &&
  (node.type === 'source' || node.type === 'transform' || node.type === 'merge' || node.type === 'sink') &&
  isString(node.route) &&
  Array.isArray(node.tags);

const normalizeEdge = (edge: unknown): edge is BlueprintEdgeInput =>
  isObject(edge) &&
  isString(edge.id) &&
  isString(edge.from) &&
  isString(edge.to) &&
  isNumber(edge.latencyMs) &&
  isNumber(edge.weight);

const normalizeStep = (step: unknown): step is BlueprintStepInput =>
  isObject(step) &&
  isString(step.id) &&
  isString(step.name) &&
  isString(step.phase) &&
  isString(step.node) &&
  (step.intensity === 'calm' || step.intensity === 'elevated' || step.intensity === 'extreme') &&
  isNumber(step.estimatedMs) &&
  isString(step.plugin);

const normalizeBlueprint = (value: BlueprintInput): Omit<BlueprintDocument, 'metadata'> => {
  if (!isString(value.id) || !isString(value.tenant) || !isString(value.namespace)) {
    throw new Error('invalid blueprint identity');
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges) || !Array.isArray(value.steps)) {
    throw new Error('invalid blueprint collections');
  }

  return {
    id: value.id,
    tenant: value.tenant,
    namespace: value.namespace,
    createdAt: new Date().toISOString(),
    nodes: value.nodes.filter(normalizeNode),
    edges: value.edges.filter(normalizeEdge),
    steps: value.steps.filter(normalizeStep),
  };
};

const hydrateGraphEdges = (edges: readonly BlueprintEdgeInput[]): readonly GraphEdge[] =>
  edges.map((edge) => ({
    id: makeEdgeId(edge.id),
    from: makeNodeId(edge.from),
    to: makeNodeId(edge.to),
    latencyMs: Math.max(0, edge.latencyMs),
    weight: Math.max(0, Math.min(1, edge.weight)),
  }));

const hydrateGraphNodes = (nodes: readonly BlueprintNodeInput[]): readonly GraphNode[] =>
  nodes.map((node) => ({
    id: makeNodeId(node.id),
    type: node.type,
    route: node.route,
    tags: [...node.tags],
  }));

const hydrateGraphSteps = (steps: readonly BlueprintStepInput[], namespace: string): readonly GraphStep<string>[] =>
  steps.map((step) => ({
    id: step.id as GraphStep<string>['id'],
    name: step.name,
    phase: `recovery.${namespace}:${step.phase}`,
    node: makeNodeId(step.node),
    intensity: step.intensity,
    plugin: step.plugin as GraphStep<string>['plugin'],
    estimatedMs: Math.max(0, step.estimatedMs),
  }));

export const parseBlueprint = (value: BlueprintInput): WorkflowBlueprint<string> => {
  const normalized = normalizeBlueprint(value);

  const nodes = hydrateGraphNodes(normalized.nodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = hydrateGraphEdges(normalized.edges).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const steps = hydrateGraphSteps(normalized.steps, normalized.namespace);

  return {
    id: makeRunId(normalized.id),
    tenant: normalized.tenant,
    namespace: `recovery.${normalized.namespace}` as `recovery.${string}`,
    createdAt: normalized.createdAt,
    nodes,
    edges,
    steps,
  };
};

export const makeStepFromInput = (value: BlueprintStepInput): GraphStep<string> => {
  if (!isString(value.id) || !isString(value.phase)) {
    throw new Error('invalid step payload');
  }
  return {
    id: value.id as GraphStep<string>['id'],
    name: value.name,
    phase: value.phase,
    node: makeNodeId(value.node),
    intensity: value.intensity,
    plugin: value.plugin as GraphStep<string>['plugin'],
    estimatedMs: Math.max(0, value.estimatedMs),
  };
};

export const toBlueprint = (input: {
  id: GraphRunId;
  tenant: string;
  namespace: string;
  nodes: readonly BlueprintNodeInput[];
  edges: readonly BlueprintEdgeInput[];
  steps: readonly BlueprintStepInput[];
}): WorkflowBlueprint<string> => {
  const parsed = parseBlueprint(input);
  return {
    ...parsed,
    id: input.id,
    namespace: `recovery.${input.namespace}`,
    steps: parsed.steps.map((step) => ({
      ...step,
      plugin: step.plugin,
      phase: `recovery.${input.namespace}:${step.phase}`,
    })),
    nodes: hydrateGraphNodes(input.nodes),
    edges: hydrateGraphEdges(input.edges),
  };
};

export const asDocument = (input: {
  id: string;
  tenant: string;
  namespace: string;
  nodes: readonly BlueprintNodeInput[];
  edges: readonly BlueprintEdgeInput[];
  steps: readonly BlueprintStepInput[];
}): BlueprintDocument => ({
  ...input,
  createdAt: new Date().toISOString(),
  metadata: {
    version: 1,
    channel: `recovery-lab-${input.tenant}`,
  },
});
