import { z } from 'zod';

export type GridStamp = number & { readonly __tag: unique symbol };

export const GridStampSchema = z
  .number()
  .int()
  .min(0)
  .transform((value) => value as GridStamp);

export type NodeKind = 'source' | 'transform' | 'sink' | 'control' | 'bridge' | 'cache' | 'egress';
export type EdgeKind = 'data' | 'meta' | 'control';
export type Region = 'us-east' | 'us-west' | 'eu-west' | 'eu-central' | 'ap-southeast' | 'ap-northeast';
export type Constraint = { min: number; max: number; unit: string };

export interface IdentityRef {
  readonly tenantId: string;
  readonly accountId: string;
  readonly userId?: string;
}

export interface ThroughputWindow {
  readonly sampleWindowMs: number;
  readonly targetRps: number;
  readonly maxBurst: number;
}

export interface RetryPolicy {
  readonly attempts: number;
  readonly backoffMs: readonly number[];
  readonly jitterPercent: number;
  readonly stopOnRetryable: boolean;
}

export interface NodeFingerprint {
  readonly hash: string;
  readonly stable: boolean;
  readonly version: number;
}

export interface ErrorEnvelope {
  readonly code: string;
  readonly retryable: boolean;
  readonly timestamp: Date;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface GridContext {
  readonly id: GridStamp;
  readonly region: Region;
  readonly owner: IdentityRef;
  readonly stamp: GridStamp;
  readonly revision: number;
  readonly window: ThroughputWindow;
}

export interface NodeMetrics {
  readonly observed: number;
  readonly dropped: number;
  readonly retried: number;
  readonly delayedMs: number;
  readonly latencyP50Ms: number;
  readonly latencyP95Ms: number;
  readonly latencyP99Ms: number;
}

export interface EdgeMetrics {
  readonly throughput: number;
  readonly saturation: number;
  readonly droppedPackets: number;
  readonly blockedRetries: number;
  readonly retryPenalty: number;
}

export type NodeId<N extends string = string> = `${N}-node-${string}`;
export type EdgeId = `edge-${string}`;
export type GraphId = `graph-${string}`;

export interface GridNodeBase {
  readonly kind: NodeKind;
  readonly id: NodeId;
  readonly region: Region;
  readonly owner: IdentityRef;
  readonly constraints: Readonly<Constraint[]>;
  readonly fingerprint: NodeFingerprint;
  readonly metrics: NodeMetrics;
  readonly policy: RetryPolicy;
  readonly tags: Readonly<Record<string, string>>;
}

export interface SourceNode<TPayload = unknown> extends GridNodeBase {
  readonly kind: 'source';
  readonly input: null;
  readonly outputType: string;
  readonly endpoint: string;
  readonly schema: TPayload;
}

export interface TransformNode<TInput = unknown, TOutput = unknown> extends GridNodeBase {
  readonly kind: 'transform';
  readonly input: NodeId;
  readonly outputType: string;
  readonly transform: (value: TInput, context: GridContext) => TOutput;
  readonly compiledShader?: string;
}

export interface SinkNode<TInput = unknown> extends GridNodeBase {
  readonly kind: 'sink';
  readonly input: NodeId;
  readonly sink: string;
  readonly accepted: string;
  readonly output: TInput;
}

export interface CacheNode<TInput = unknown> extends GridNodeBase {
  readonly kind: 'cache';
  readonly input: NodeId;
  readonly ttlMs: number;
  readonly maxItems: number;
  readonly evictOnError: boolean;
  readonly store(value: TInput): Promise<void>;
  readonly lookup(id: string): Promise<TInput | null>;
}

export interface BridgeNode extends GridNodeBase {
  readonly kind: 'bridge';
  readonly source: NodeId;
  readonly target: NodeId;
  readonly protocol: 'grpc' | 'http' | 'kafka' | 'nats';
  readonly transformEdge?: EdgeId;
}

export interface ControlNode extends GridNodeBase {
  readonly kind: 'control';
  readonly input: NodeId;
  readonly commandBus: string;
  readonly guards: ReadonlyArray<z.ZodTypeAny>;
}

export interface EgressNode extends GridNodeBase {
  readonly kind: 'egress';
  readonly input: NodeId;
  readonly exports: readonly string[];
  readonly compression: 'gzip' | 'snappy' | 'zstd' | 'none';
}

export interface GraphEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: EdgeKind;
  readonly capacityPerSecond: number;
  readonly policy: RetryPolicy;
  readonly metrics: EdgeMetrics;
}

export interface GraphDefinition {
  readonly id: GraphId;
  readonly ctx: GridContext;
  readonly nodes: ReadonlyArray<GridNodeBase>;
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly created: number;
}

export interface GraphEvent {
  readonly stamp: GridStamp;
  readonly source: GraphId;
  readonly type: 'added' | 'removed' | 'updated' | 'degraded' | 'recovered';
  readonly payload: Readonly<Record<string, unknown>>;
}

export type NodeEvent<TPayload = unknown> = {
  readonly node: NodeId;
  readonly type: 'start' | 'stop' | 'error' | 'throttle';
  readonly payload: TPayload;
};

export type GridHealth = 'ok' | 'warning' | 'critical' | 'unknown';

export interface HealthReport {
  readonly graph: GraphId;
  readonly nodeHealth: Readonly<Record<NodeId, GridHealth>>;
  readonly edgeHealth: Readonly<Record<EdgeId, GridHealth>>;
  readonly summary: {
    readonly score: number;
    readonly checks: number;
    readonly failed: number;
  };
}

export interface SourceNode_001 extends SourceNode<{ type: 'metrics'; value: number }> {
  readonly sourceName: 'src-001';
  readonly stream: string;
}

export interface SourceNode_002 extends SourceNode<{ type: 'trace'; value: string }> {
  readonly sourceName: 'src-002';
  readonly stream: string;
}

export interface SourceNode_003 extends SourceNode<{ type: 'event'; value: unknown }> {
  readonly sourceName: 'src-003';
  readonly stream: string;
}

export interface SourceNode_004 extends SourceNode<{ type: 'batch'; value: readonly unknown[] }> {
  readonly sourceName: 'src-004';
  readonly stream: string;
}

export interface SourceNode_005 extends SourceNode<{ type: 'snapshot'; value: Record<string, unknown> }> {
  readonly sourceName: 'src-005';
  readonly stream: string;
}

export interface SourceNode_006 extends SourceNode<{ type: 'heartbeat'; value: boolean }> {
  readonly sourceName: 'src-006';
  readonly stream: string;
}

export interface SourceNode_007 extends SourceNode<{ type: 'metric-delta'; value: number }> {
  readonly sourceName: 'src-007';
  readonly stream: string;
}

export interface SourceNode_008 extends SourceNode<{ type: 'kpi'; value: { current: number; target: number } }> {
  readonly sourceName: 'src-008';
  readonly stream: string;
}

export interface SourceNode_009 extends SourceNode<{ type: 'inventory'; value: { sku: string; count: number } }> {
  readonly sourceName: 'src-009';
  readonly stream: string;
}

export interface SourceNode_010 extends SourceNode<{ type: 'order'; value: { id: string; total: number } }> {
  readonly sourceName: 'src-010';
  readonly stream: string;
}

export interface SourceNode_011 extends SourceNode<{ type: 'user-event'; value: { userId: string; action: string } }> {
  readonly sourceName: 'src-011';
  readonly stream: string;
}

export interface SourceNode_012 extends SourceNode<{ type: 'billing'; value: { invoiceId: string; amount: number } }> {
  readonly sourceName: 'src-012';
  readonly stream: string;
}

export interface SourceNode_013 extends SourceNode<{ type: 'audit'; value: string }> {
  readonly sourceName: 'src-013';
  readonly stream: string;
}

export interface SourceNode_014 extends SourceNode<{ type: 'alert'; value: { severity: string; reason: string } }> {
  readonly sourceName: 'src-014';
  readonly stream: string;
}

export interface SourceNode_015 extends SourceNode<{ type: 'recommendation'; value: readonly string[] }> {
  readonly sourceName: 'src-015';
  readonly stream: string;
}

export interface SourceNode_016 extends SourceNode<{ type: 'feature'; value: Readonly<Record<string, unknown>> }> {
  readonly sourceName: 'src-016';
  readonly stream: string;
}

export interface SourceNode_017 extends SourceNode<{ type: 'identity'; value: { principal: string; scopes: string[] } }> {
  readonly sourceName: 'src-017';
  readonly stream: string;
}

export interface SourceNode_018 extends SourceNode<{ type: 'policy'; value: { rule: string; enabled: boolean } }> {
  readonly sourceName: 'src-018';
  readonly stream: string;
}

export interface SourceNode_019 extends SourceNode<{ type: 'search'; value: { q: string; k: string } }> {
  readonly sourceName: 'src-019';
  readonly stream: string;
}

export interface SourceNode_020 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-020';
  readonly stream: string;
}

export interface SourceNode_021 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-021';
  readonly stream: string;
}

export interface SourceNode_022 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-022';
  readonly stream: string;
}

export interface SourceNode_023 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-023';
  readonly stream: string;
}

export interface SourceNode_024 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-024';
  readonly stream: string;
}

export interface SourceNode_025 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-025';
  readonly stream: string;
}

export interface SourceNode_026 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-026';
  readonly stream: string;
}

export interface SourceNode_027 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-027';
  readonly stream: string;
}

export interface SourceNode_028 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-028';
  readonly stream: string;
}

export interface SourceNode_029 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-029';
  readonly stream: string;
}

export interface SourceNode_030 extends SourceNode<{ type: 'knowledge'; value: { doc: string; score: number } }> {
  readonly sourceName: 'src-030';
  readonly stream: string;
}

export type SourceCatalog =
  | SourceNode_001
  | SourceNode_002
  | SourceNode_003
  | SourceNode_004
  | SourceNode_005
  | SourceNode_006
  | SourceNode_007
  | SourceNode_008
  | SourceNode_009
  | SourceNode_010
  | SourceNode_011
  | SourceNode_012
  | SourceNode_013
  | SourceNode_014
  | SourceNode_015
  | SourceNode_016
  | SourceNode_017
  | SourceNode_018
  | SourceNode_019
  | SourceNode_020
  | SourceNode_021
  | SourceNode_022
  | SourceNode_023
  | SourceNode_024
  | SourceNode_025
  | SourceNode_026
  | SourceNode_027
  | SourceNode_028
  | SourceNode_029
  | SourceNode_030;

export interface TopologyDelta {
  readonly graph: GraphId;
  readonly added: ReadonlyArray<GraphEdge>;
  readonly removed: ReadonlyArray<string>;
  readonly mutated: ReadonlyArray<GraphDefinition>;
}

export function createSourceNode(
  ctx: GridContext,
  kind: 'source',
  template: SourceNode<string>,
): SourceNode {
  return {
    ...template,
    kind,
    region: template.region ?? ctx.region,
    owner: template.owner ?? ctx.owner,
    constraints: template.constraints ?? [],
    fingerprint: template.fingerprint ?? { hash: `fp-${ctx.id}`, stable: true, version: 1 },
    metrics: template.metrics ?? {
      observed: 0,
      dropped: 0,
      retried: 0,
      delayedMs: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      latencyP99Ms: 0,
    },
    policy: template.policy ?? {
      attempts: 3,
      backoffMs: [25, 50, 100],
      jitterPercent: 5,
      stopOnRetryable: true,
    },
    tags: template.tags ?? {},
  };
}

export function isControlKind(node: GridNodeBase): node is ControlNode {
  return node.kind === 'control';
}

export function isEdgeMeta(edge: GraphEdge): boolean {
  return edge.kind === 'meta';
}
