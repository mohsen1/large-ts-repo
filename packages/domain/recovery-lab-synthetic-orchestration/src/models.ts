import { type Brand, type PluginId } from '@shared/lab-graph-runtime';

export type GraphRunId = Brand<string, 'run-id'>;
export type NodeId = Brand<string, 'node-id'>;
export type StepId = Brand<string, 'step-id'>;
export type ChannelId = Brand<string, 'channel-id'>;
export type EdgeId = Brand<string, 'edge-id'>;

export type Intensity = 'calm' | 'elevated' | 'extreme';
export type IntensityLevel = Intensity;

export interface SignalEnvelope<TPayload extends string = string> {
  readonly id: string;
  readonly kind: TPayload;
  readonly tenant: string;
  readonly timestamp: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface GraphNode {
  readonly id: NodeId;
  readonly type: 'source' | 'transform' | 'merge' | 'sink';
  readonly route: string;
  readonly tags: readonly string[];
}

export interface GraphEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly latencyMs: number;
  readonly weight: number;
}

export interface GraphStep<TContext extends string = string> {
  readonly id: StepId;
  readonly name: string;
  readonly phase: `recovery.${TContext}` | string;
  readonly node: NodeId;
  readonly intensity: IntensityLevel;
  readonly plugin: PluginId;
  readonly estimatedMs: number;
}

export interface WorkflowBlueprint<TContext extends string = string> {
  readonly id: GraphRunId;
  readonly tenant: string;
  readonly namespace: `recovery.${TContext}`;
  readonly createdAt: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly steps: readonly GraphStep<TContext>[];
}

export interface RunContext {
  readonly workspace: string;
  readonly tenant: string;
  readonly channel: ChannelId;
  readonly labels: Readonly<Record<string, string>>;
}

export interface WorkspaceState {
  readonly runId: GraphRunId;
  readonly tenant: string;
  readonly channel: ChannelId;
  readonly nodes: ReadonlyMap<NodeId, GraphNode>;
  readonly edges: readonly GraphEdge[];
  readonly stepCount: number;
}

export interface PlanSnapshot {
  readonly startedAt: string;
  readonly runId: GraphRunId;
  readonly namespace: string;
  readonly progress: number;
  readonly activeStep?: StepId;
  readonly status: 'pending' | 'running' | 'complete' | 'failed';
}

export interface StepTrace<TOutput> {
  readonly step: StepId;
  readonly phase: string;
  readonly elapsedMs: number;
  readonly output: TOutput;
}

export const intensityOrder = ['calm', 'elevated', 'extreme'] as const;

export const makeNodeId = (seed: string): NodeId => `${seed}` as NodeId;
export const makeStepId = (seed: string): StepId => `${seed}` as StepId;
export const makeEdgeId = (seed: string): EdgeId => `${seed}` as EdgeId;
export const makeChannelId = (seed: string): ChannelId => `${seed}` as ChannelId;
export const makeRunId = (seed: string): GraphRunId => `${seed}` as GraphRunId;
export const isExtremeIntensity = (value: IntensityLevel): value is 'extreme' => value === 'extreme';

export const sortByIntensity = <T extends ReadonlyArray<IntensityLevel>>(levels: T): readonly IntensityLevel[] =>
  [...levels].sort((left, right) => intensityOrder.indexOf(left) - intensityOrder.indexOf(right));

export const normalizeNode = (value: GraphNode): GraphNode => ({
  ...value,
  tags: [...value.tags],
});

export const summarizeWorkspace = (state: WorkspaceState): string => {
  const edgeCount = state.edges.length;
  return `run=${state.runId} tenant=${state.tenant} nodes=${state.nodes.size} edges=${edgeCount} steps=${state.stepCount}`;
};

export const isCalmStep = (value: GraphStep<string>): boolean => value.intensity === 'calm';

export const asStepMap = <T extends GraphStep<string>>(steps: readonly T[]): Record<string, T> =>
  Object.fromEntries(steps.map((step) => [step.id, step]));
