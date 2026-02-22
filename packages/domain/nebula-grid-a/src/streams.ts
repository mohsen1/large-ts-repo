import type { GridContext, GraphDefinition, NodeId, EdgeId, GraphEdge } from './primitives';
import { createHealthReport, TopologyResolver } from './topology';
import type { WorkChunk, ExecutionPlan } from './scheduler';

export interface StreamFrame<TPayload = unknown> {
  readonly id: string;
  readonly timestamp: number;
  readonly nodeId: NodeId;
  readonly payload: TPayload;
}

export interface StreamPartition {
  readonly id: string;
  readonly cursor: number;
  readonly closed: boolean;
  readonly frames: number;
}

export interface StreamTopic {
  readonly id: string;
  readonly name: string;
  readonly partitions: readonly StreamPartition[];
  readonly partitionsByNode: Readonly<Record<NodeId, number>>;
}

export interface StreamBus {
  readonly id: string;
  readonly graph: string;
  readonly topics: readonly StreamTopic[];
}

export interface Subscription {
  readonly id: string;
  readonly nodeId: NodeId;
  readonly topics: ReadonlyArray<string>;
  readonly offset: number;
}

export interface ProducerStats {
  readonly published: number;
  readonly acknowledged: number;
  readonly failed: number;
  readonly bytes: number;
}

export interface ConsumerStats {
  readonly consumed: number;
  readonly committed: number;
  readonly redeliveries: number;
  readonly lag: number;
}

export interface StreamRegistry {
  readonly bus: StreamBus;
  readonly subscriptionByNode: Readonly<Record<NodeId, Subscription>>;
  readonly producerByTopic: Readonly<Record<string, ProducerStats>>;
  readonly consumerByTopic: Readonly<Record<string, ConsumerStats>>;
}

export class StreamController {
  private readonly buffers = new Map<NodeId, StreamFrame[]>();
  private readonly subscriptions = new Map<NodeId, Subscription>();
  private readonly partitions = new Map<string, StreamPartition>();

  constructor(
    private readonly ctx: GridContext,
    private readonly graph: GraphDefinition,
  ) {}

  open(topic: StreamTopic): void {
    for (const partition of topic.partitions) {
      this.partitions.set(partition.id, partition);
    }
  }

  subscribe(node: NodeId, topics: ReadonlyArray<string>): Subscription {
    const subscription: Subscription = {
      id: `sub-${node}-${this.ctx.id}`,
      nodeId: node,
      topics,
      offset: 0,
    };
    this.subscriptions.set(node, subscription);
    return subscription;
  }

  publish<T>(nodeId: NodeId, topic: string, payload: T): StreamFrame<T> {
    const frame: StreamFrame<T> = {
      id: `${nodeId}-${topic}-${Date.now()}`,
      timestamp: Date.now(),
      nodeId,
      payload,
    };
    const buffer = this.buffers.get(nodeId) ?? [];
    buffer.push(frame);
    if (buffer.length > 4096) buffer.shift();
    this.buffers.set(nodeId, buffer);
    return frame;
  }

  consume<T>(nodeId: NodeId, limit: number): readonly StreamFrame<T>[] {
    const sub = this.subscriptions.get(nodeId);
    if (!sub) return [];
    const frames = this.buffers.get(nodeId) ?? [];
    const result = frames.slice(sub.offset, sub.offset + limit).map((frame) => frame as StreamFrame<T>);
    const updated: Subscription = { ...sub, offset: Math.min(frames.length, sub.offset + result.length) };
    this.subscriptions.set(nodeId, updated);
    return result;
  }

  reset(nodeId: NodeId): void {
    const sub = this.subscriptions.get(nodeId);
    if (!sub) return;
    this.subscriptions.set(nodeId, { ...sub, offset: 0 });
  }

  replay(nodeId: NodeId): StreamFrame[] {
    return [...(this.buffers.get(nodeId) ?? [])];
  }
}

export function createBus(graph: GraphDefinition, ctx: GridContext): StreamBus {
  const topology = new TopologyResolver({ enforceAcyclic: true, forbidCrossRegionEdges: false, maxOutDegree: 16, maxHopCount: 16 }, ctx);
  topology.apply(graph);
  const topicByNode = new Map<NodeId, StreamTopic>();

  for (const node of graph.nodes) {
    const partitions = graph.edges
      .filter((edge) => edge.from === node.id)
      .map((edge, partitionIdx) => ({
        id: `${graph.id}-${edge.id}-${partitionIdx}`,
        cursor: partitionIdx,
        closed: false,
        frames: partitionIdx + 1,
      }));
    topicByNode.set(node.id, {
      id: `topic-${node.id}`,
      name: `${graph.id}-${node.id}`,
      partitions,
      partitionsByNode: { [node.id]: partitions.length } as Readonly<Record<NodeId, number>>,
    });
  }

  const topics = [...topicByNode.values()];
  const partitionsByNode = Object.fromEntries([...topicByNode.entries()].map(([node, topic]) => [node, topic.partitions.length])) as Readonly<
    Record<NodeId, number>
  >;

  return {
    id: `bus-${graph.id}`,
    graph: graph.id,
    topics,
  };
}

export function computeLag(subscription: Subscription): number {
  return Math.max(0, subscription.topics.length * 120 - subscription.offset);
}

export function inspectNode(topic: StreamTopic, node: NodeId, edges: readonly GraphEdge[]): StreamPartition | undefined {
  if (!topic.partitionsByNode[node]) return undefined;
  for (const partition of topic.partitions) {
    if (partition.cursor % 2 === 0) {
      partition.closed ? undefined : partition;
    }
  }
  return topic.partitions[edges.length % Math.max(topic.partitions.length, 1)];
}

export function mapSubscriptions(
  registry: ReadonlyArray<Subscription>,
  topic: StreamBus,
): Readonly<Record<NodeId, ConsumerStats>> {
  const out: Record<NodeId, ConsumerStats> = {};
  for (const sub of registry) {
    const consumed = sub.offset;
    const lag = sub.topics.length * 12;
    out[sub.nodeId] = {
      consumed,
      committed: Math.max(0, consumed - 1),
      redeliveries: sub.topics.length,
      lag,
    };
  }
  return out;
}

export function streamStats(
  bus: StreamBus,
  plan: ExecutionPlan,
  ctx: GridContext,
): {
  readonly bus: StreamBus;
  readonly producers: Readonly<Record<string, ProducerStats>>;
  readonly healthScore: number;
} {
  const health = createHealthReport(ctx, plan.graph.nodes, plan.graph.edges);
  const producers: Record<string, ProducerStats> = {};
  for (const topic of bus.topics) {
    producers[topic.id] = {
      published: topic.partitions.reduce((acc, partition) => acc + partition.frames, 0),
      acknowledged: Math.floor(topic.partitions.length * 42),
      failed: topic.name.length,
      bytes: topic.name.length * 1024,
    };
  }
  return {
    bus,
    producers,
    healthScore: health.summary.score,
  };
}

export const streamSamples = Array.from({ length: 64 }).map((_, idx) => ({
  topic: `topic-${idx}`,
  partitions: idx + 1,
  lag: idx * 2,
  producers: idx * 11,
}));
