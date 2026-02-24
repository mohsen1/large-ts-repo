import { z } from 'zod';
import {
  type Brand,
  EntityId,
  IsoTimestamp,
  NonEmptyTuple,
  RecursiveDepthTuple,
  StageMetadata,
  StageId,
  asEntityId,
  asRunId,
  isoNow,
} from '@shared/temporal-ops-runtime';

export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type TimelineNodeState = 'pending' | 'active' | 'complete' | 'failed' | 'skipped';
export type TemporalPhase = 'ingest' | 'validate' | 'simulate' | 'execute' | 'verify';

export interface TimelineEdge {
  readonly to: StageId;
  readonly from: StageId;
  readonly rationale: string;
}

export interface TimelineNode<TPayload = unknown> {
  readonly id: StageId;
  readonly kind: Brand<string, 'TimelineNodeKind'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly name: string;
  readonly state: TimelineNodeState;
  readonly phase: TemporalPhase;
  readonly payload: TPayload;
  readonly startedAt: IsoTimestamp;
  readonly completedAt?: IsoTimestamp;
  readonly dependsOn: readonly StageId[];
  readonly errors: readonly string[];
}

export interface TemporalRunbook<TMeta = unknown> {
  readonly runId: Brand<string, 'RunId'>;
  readonly name: string;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly scope: `scope:${string}`;
  readonly nodes: readonly TimelineNode<TMeta>[];
  readonly edges: readonly TimelineEdge[];
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly metadata: TMeta;
}

export interface OrchestrationSignal<TSignalType extends string, TPayload = unknown> {
  readonly signalId: EntityId;
  readonly type: `signal:${TSignalType}`;
  readonly issuedAt: IsoTimestamp;
  readonly runId: Brand<string, 'RunId'>;
  readonly ttlMs: number;
  readonly severity: 'low' | 'medium' | 'critical';
  readonly payload: TPayload;
}

export interface TemporalSnapshot<TState = unknown> {
  readonly runId: Brand<string, 'RunId'>;
  readonly stateVersion: number;
  readonly state: TState;
  readonly checksum: Brand<string, 'Checksum'>;
  readonly emittedAt: IsoTimestamp;
}

export interface PluginRuntimeDescriptor {
  readonly registry: {
    readonly name: string;
    readonly version: `v${number}`;
    readonly stage: TemporalPhase;
  };
  readonly defaults: readonly string[];
}

export const timelineNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  tenant: z.string(),
  name: z.string(),
  state: z.enum(['pending', 'active', 'complete', 'failed', 'skipped']),
  phase: z.enum(['ingest', 'validate', 'simulate', 'execute', 'verify']),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  dependsOn: z.array(z.string()),
  errors: z.array(z.string()),
  payload: z.unknown(),
});

export const runbookSchema = z.object({
  runId: z.string(),
  name: z.string(),
  tenant: z.string(),
  scope: z.string(),
  nodes: z.array(timelineNodeSchema),
  edges: z.array(
    z.object({
      to: z.string(),
      from: z.string(),
      rationale: z.string(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.unknown(),
});

export const signalSchema = z.object({
  signalId: z.string(),
  type: z.string(),
  issuedAt: z.string(),
  runId: z.string(),
  ttlMs: z.number().nonnegative(),
  severity: z.enum(['low', 'medium', 'critical']),
  payload: z.unknown(),
});

export const temporalStagePath = <TPath extends string>(path: NonEmptyTuple<TPath>): string => path.join('::');

export type TemporalTupleDepth<TItem> = RecursiveDepthTuple<TItem, 3>;

export const createRunbook = (
  name: string,
  tenant: Brand<string, 'TenantId'>,
  scope: string,
): TemporalRunbook<Record<string, unknown>> => {
  const now = isoNow();
  return {
    runId: asRunId(tenant, `${name}-${Math.random().toString(36).slice(2)}`),
    name,
    tenant,
    scope: `scope:${scope}`,
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
};

export const buildSignal = <TSignalType extends string, TPayload>(
  runId: Brand<string, 'RunId'>,
  type: TSignalType,
  payload: NoInfer<TPayload>,
  ttlMs: number,
): OrchestrationSignal<TSignalType, TPayload> => ({
  signalId: asEntityId(Math.random().toString(16)),
  type: `signal:${type}`,
  issuedAt: isoNow(),
  runId,
  ttlMs,
  severity: 'medium',
  payload,
});

export const normalizeNodeMap = (nodes: readonly TimelineNode[]): ReadonlyMap<StageId, TimelineNode> => {
  const map = new Map<StageId, TimelineNode>();
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return map;
};

export const advanceNode = <TPayload>(
  node: TimelineNode<TPayload>,
  state: TimelineNodeState,
  errors: readonly string[] = [],
): TimelineNode<TPayload> => ({
  ...node,
  state,
  completedAt: state === 'complete' || state === 'failed' ? isoNow() : node.completedAt,
  errors: errors.length ? [...errors] : node.errors,
});

export const resolveDependencyOrder = (nodes: readonly TimelineNode[]): readonly TimelineNode[] => {
  const seen = new Set<StageId>();
  const out: TimelineNode[] = [];

  const byId = normalizeNodeMap(nodes);

  const visit = (nodeId: StageId): void => {
    if (seen.has(nodeId)) {
      return;
    }

    const node = byId.get(nodeId);
    if (!node) {
      return;
    }

    for (const dependency of node.dependsOn) {
      visit(dependency);
    }

    seen.add(nodeId);
    out.push(node);
  };

  for (const node of nodes.toSorted((left, right) => left.phase.localeCompare(right.phase))) {
    visit(node.id);
  }

  return out;
};
