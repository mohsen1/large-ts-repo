import type { Brand, KeyPaths, NonEmptyArray, PathTuple, Prettify } from '@shared/type-level';

export type MeshTenantId = Brand<string, 'MeshTenantId'>;
export type MeshRegionId = Brand<string, 'MeshRegionId'>;
export type MeshRunId = Brand<string, 'MeshRunId'>;
export type MeshPlanId = Brand<string, 'MeshPlanId'>;
export type MeshStageId = Brand<string, 'MeshStageId'>;
export type MeshNodeId = Brand<string, 'MeshNodeId'>;
export type MeshSignalId = Brand<string, 'MeshSignalId'>;
export type MeshIntentId = Brand<string, 'MeshIntentId'>;

export type MeshExecutionPhase = 'detect' | 'assess' | 'orchestrate' | 'simulate' | 'execute' | 'observe' | 'recover' | 'settle';
export type MeshSignalKind = 'forecast' | 'anomaly' | 'incident' | 'command' | 'audit';
export type MeshSeverity = 'trace' | 'info' | 'warn' | 'critical';
export type MeshRiskBand = 'low' | 'moderate' | 'high' | 'critical';

export type MeshNamespace = `${string}::${string}`;
export type MeshSignalName<T extends string = string> = `mesh:${MeshTenantId & string}:${T}`;
export type MeshEventName<T extends string = string> = `mesh:event:${MeshSignalId & string}:${T}`;
export type MeshPluginName<T extends string = string> = `mesh-plugin:${T}`;
export type MeshScopeLabel = `${MeshTenantId & string}/${MeshRegionId & string}`;

export type MeshPluginTemplate = MeshPluginName<string>;
export type MeshRoutePath = `/${string}/${string}` | `/${string}/${string}/${string}`;
export type MeshKeyPath = `v${string}:${string}`;
export type MeshPathPrefix<T extends string> = T extends `${infer Root}:${infer Rest}` ? [Root, ...PathTuple<Rest & string>] : [T];

export interface MeshSpan {
  readonly tenant: MeshTenantId;
  readonly region: MeshRegionId;
  readonly phase: MeshExecutionPhase;
  readonly scope: string;
  readonly startedAt: string;
}

export interface MeshSignal {
  readonly id: MeshSignalId;
  readonly tenant: MeshTenantId;
  readonly region: MeshRegionId;
  readonly kind: MeshSignalKind;
  readonly name: MeshSignalName;
  readonly severity: MeshSeverity;
  readonly riskBand: MeshRiskBand;
  readonly confidence: number;
  readonly labels: readonly string[];
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface MeshEdge {
  readonly from: MeshNodeId;
  readonly to: MeshNodeId;
  readonly weight: number;
  readonly policyIds: readonly MeshIntentId[];
}

export interface MeshNode {
  readonly id: MeshNodeId;
  readonly tenant: MeshTenantId;
  readonly region: MeshRegionId;
  readonly role: string;
  readonly stage: MeshExecutionPhase;
  readonly signals: readonly MeshSignalId[];
  readonly health: number;
  readonly metadata: Record<string, string | number | boolean>;
}

export interface MeshTopology {
  readonly tenant: MeshTenantId;
  readonly region: MeshRegionId;
  readonly runId: MeshRunId;
  readonly runLabel: MeshScopeLabel;
  readonly nodes: readonly MeshNode[];
  readonly edges: readonly MeshEdge[];
}

export interface MeshRunMetadata {
  readonly runId: MeshRunId;
  readonly tenant: MeshTenantId;
  readonly route: MeshRoutePath;
  readonly namespace: MeshNamespace;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly finishedAt?: string;
  readonly labels: readonly MeshScopeLabel[];
}

export interface MeshStep<TInput = unknown, TOutput = unknown> {
  readonly stage: MeshExecutionPhase;
  readonly node: MeshNodeId;
  readonly startedAt: string;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface MeshIntent {
  readonly id: MeshIntentId;
  readonly tenant: MeshTenantId;
  readonly runId: MeshRunId;
  readonly labels: readonly string[];
  readonly phase: MeshExecutionPhase;
  readonly targetNodeIds: readonly MeshNodeId[];
  readonly expectedConfidence: number;
  readonly command: string;
}

export interface MeshPlan {
  readonly id: MeshPlanId;
  readonly tenant: MeshTenantId;
  readonly runId: MeshRunId;
  readonly label: string;
  readonly scope: MeshScopeLabel;
  readonly intents: readonly MeshIntent[];
  readonly steps: readonly MeshStep[];
}

export interface MeshEvent {
  readonly eventId: MeshSignalId;
  readonly runId: MeshRunId;
  readonly tenant: MeshTenantId;
  readonly phase: MeshExecutionPhase;
  readonly node: MeshNodeId;
  readonly name: MeshEventName;
  readonly detail: Record<string, unknown>;
  readonly at: string;
}

export interface MeshEnvelope {
  readonly tenant: MeshTenantId;
  readonly runId: MeshRunId;
  readonly event: MeshEvent;
  readonly span: MeshSpan;
}

export type RecursivePathList<T> = T extends Record<string, unknown>
  ? { [K in keyof T & string]: T[K] extends Record<string, unknown> ? [K, ...RecursivePathList<T[K]>] : [K] }[keyof T & string]
  : [];

export type RemapEventKeys<T> = {
  [K in keyof T & string as `${MeshTenantId & string}:${MeshSignalId & string}:${K}`]: T[K];
};

export type PathAware<T> = {
  [K in keyof T & string as `${MeshTenantId & string}/${K}`]: T[K];
};

export type MeshNodeDepth<TNode extends MeshNode> = RecursivePathList<TNode> extends readonly any[] ? RecursivePathList<TNode>['length'] : 0;

export type StageTuple<T extends readonly string[]> = T extends readonly [infer Head, ...infer Rest]
  ? Rest extends readonly string[]
    ? readonly [Head & string, ...StageTuple<Rest>]
    : readonly [Head & string]
  : [];

export type RiskAccumulator<T extends readonly MeshRiskBand[]> = T extends readonly [infer Head extends MeshRiskBand, ...infer Rest extends MeshRiskBand[]]
  ? {
      [K in Head]: K;
    } & RiskAccumulator<Rest>
  : {};

export const PHASE_ORDER = ['detect', 'assess', 'orchestrate', 'simulate', 'execute', 'observe', 'recover', 'settle'] as const satisfies readonly MeshExecutionPhase[];

export const DEFAULT_SCOPE_SUFFIX = 'default-scope' as const satisfies `${string}-scope`;

export const toMeshScope = (tenant: MeshTenantId, region: MeshRegionId): MeshScopeLabel =>
  `${tenant as string}/${region as string}` as MeshScopeLabel;

export const createTenantId = (value: string): MeshTenantId => value as MeshTenantId;
export const createRegionId = (value: string): MeshRegionId => value as MeshRegionId;
export const createRunId = (value: string): MeshRunId => value as MeshRunId;
export const createNodeId = (value: string): MeshNodeId => value as MeshNodeId;
export const createSignalId = (value: string): MeshSignalId => value as MeshSignalId;
export const createPlanId = (value: string): MeshPlanId => value as MeshPlanId;
export const createIntentId = (value: string): MeshIntentId => value as MeshIntentId;

export const isSeverityUrgent = (severity: MeshSeverity): boolean => severity === 'critical' || severity === 'warn';

export const normalizeConfidence = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

export const riskWeight = (band: MeshRiskBand): number => {
  const mapping: Record<MeshRiskBand, number> = {
    low: 0.15,
    moderate: 0.45,
    high: 0.75,
    critical: 0.95,
  };
  return mapping[band];
};

export const phaseIndex = (phase: MeshExecutionPhase): number => {
  const index = PHASE_ORDER.indexOf(phase);
  return index >= 0 ? index : PHASE_ORDER.length;
};

export const splitRoute = (route: MeshRoutePath): readonly [string, string, string?] => {
  const parts = route.split('/');
  return [parts.at(1) ?? 'core', parts.at(2) ?? 'default', parts.at(3)] as readonly [string, string, string?];
};

export const toEventName = <T extends string>(tenant: MeshTenantId, id: MeshSignalId, kind: T): MeshEventName<T> =>
  `mesh:event:${id as string}:${kind}` as MeshEventName<T>;

export const orderByPhase = <T extends { phase: MeshExecutionPhase }>(items: readonly T[]): readonly T[] => {
  return [...items].sort((left, right) => phaseIndex(left.phase) - phaseIndex(right.phase));
};

export const toNodeRecord = (node: Pick<MeshNode, 'id' | 'tenant' | 'region' | 'stage' | 'health'>) => ({
  id: node.id,
  key: `${node.tenant as string}:${node.region as string}:${node.id as string}:${node.stage}`,
  health: node.health,
});

export type DeepWritable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepWritable<T[K]>
      : T[K];
};

export type StageEdges<T extends MeshTopology> = { [K in T['nodes'][number]['id'] as `outgoing:${K & string}`]: MeshEdge[] };

export type NodeMap<TTopology extends MeshTopology> = {
  [K in TTopology['nodes'][number]['id']]: Extract<TTopology['nodes'][number], { id: K }>;
};

export type NodeHealthBucket<T extends MeshNode> = T['health'] extends infer Health extends number
  ? Health extends 0
    ? 'outage'
    : Health extends 100
      ? 'stable'
      : 'degrading'
  : never;

export const planHealth = <T extends { stages: readonly MeshStep[] }>(plan: T): NonEmptyArray<MeshExecutionPhase> => {
  const phases = Array.from(new Set(plan.stages.map((step) => step.stage)));
  return phases.length > 0 ? (phases as unknown as NonEmptyArray<MeshExecutionPhase>) : ['detect'];
};

export const flattenKeys = <T>(value: T): readonly KeyPaths<T>[] => Object.keys(value as Record<string, unknown>) as KeyPaths<T>[];

export type PlannedTopology<T extends MeshTopology> = Prettify<{
  readonly planId: MeshPlanId;
  readonly runId: T['nodes'][number]['id'];
  readonly topology: T;
  readonly routes: PathTuple<T>;
}>;

export const createMeshTopology = (tenant: MeshTenantId, region: MeshRegionId, runId: MeshRunId): MeshTopology => ({
  tenant,
  region,
  runId,
  runLabel: toMeshScope(tenant, region),
  nodes: [
    {
      id: `mesh-node:${runId as string}:0` as MeshNodeId,
      tenant,
      region,
      role: 'observer',
      stage: 'detect',
      signals: [],
      health: 78,
      metadata: {
        tier: 'core',
        purpose: 'signal-mesh',
      },
    },
    {
      id: `mesh-node:${runId as string}:1` as MeshNodeId,
      tenant,
      region,
      role: 'coordinator',
      stage: 'assess',
      signals: [],
      health: 94,
      metadata: {
        tier: 'analysis',
        purpose: 'planner',
      },
    },
  ],
  edges: [
    {
      from: `mesh-node:${runId as string}:0` as MeshNodeId,
      to: `mesh-node:${runId as string}:1` as MeshNodeId,
      weight: 0.9,
      policyIds: [`policy:${runId as string}:0` as never],
    },
  ],
});
