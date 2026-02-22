import { type GraphDefinition, type NodeId, type GraphId, type GridContext, type EdgeId, type NodeMetrics, type GraphEvent } from './primitives';
import { createHealthReport } from './topology';

export interface Meter<T = number> {
  readonly name: string;
  readonly unit: string;
  readonly samples: ReadonlyArray<T>;
}

export interface Counter extends Meter<number> {
  readonly reset: () => void;
  readonly inc: (value?: number) => void;
  readonly get: () => number;
}

export interface Gauge extends Meter<number> {
  readonly set: (value: number) => void;
  readonly reset: () => void;
}

export interface Histogram extends Meter<number> {
  readonly percentiles: Readonly<Record<'p50' | 'p90' | 'p99', number>>;
}

export interface TelemetrySnapshot {
  readonly graph: GraphId;
  readonly counters: ReadonlyArray<Counter>;
  readonly gauges: ReadonlyArray<Gauge>;
  readonly histograms: ReadonlyArray<Histogram>;
  readonly events: ReadonlyArray<GraphEvent>;
  readonly createdAt: number;
}

export interface EventBus {
  readonly graph: GraphId;
  readonly queue: GraphEvent[];
  readonly maxQueue: number;
}

export interface AlertRule<TState = unknown> {
  readonly id: string;
  readonly query: (state: TState) => boolean;
  readonly threshold: number;
  readonly action: (state: TState) => void;
}

export interface TelemetryController {
  readonly graph: GraphId;
  readonly ctx: GridContext;
  collect(): TelemetrySnapshot;
  publish(event: GraphEvent): void;
  recordCounter(name: string, value: number): void;
  setGauge(name: string, value: number): void;
  observeLatency(name: string, value: number): void;
}

export class InMemoryTelemetryController implements TelemetryController {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly hist = new Map<string, number[]>();
  private readonly events: GraphEvent[] = [];
  private readonly rules: AlertRule<InMemoryTelemetryController>[] = [];
  readonly ctx: GridContext;
  readonly graph: GraphId;

  constructor(graph: GraphId, ctx: GridContext) {
    this.graph = graph;
    this.ctx = ctx;
  }

  collect(): TelemetrySnapshot {
    const counters = [...this.counters.entries()].map(([name, value]) => ({
      name,
      unit: 'count',
      samples: [value],
      reset: () => this.counters.set(name, 0),
      inc: (amount = 1) => this.recordCounter(name, amount),
      get: () => this.counters.get(name) ?? 0,
    }));
    const gauges = [...this.gauges.entries()].map(([name, value]) => ({
      name,
      unit: 'gauge',
      samples: [value],
      set: (next) => this.setGauge(name, next),
      reset: () => this.gauges.set(name, 0),
    }));
    const histograms = [...this.hist.entries()].map(([name, samples]) => ({
      name,
      unit: 'ms',
      samples,
      percentiles: {
        p50: percentile(samples, 0.5),
        p90: percentile(samples, 0.9),
        p99: percentile(samples, 0.99),
      },
    }));
    const snapshot: TelemetrySnapshot = {
      graph: this.graph,
      counters,
      gauges,
      histograms,
      events: [...this.events],
      createdAt: Date.now(),
    };
    this.events.splice(0, this.events.length);
    return snapshot;
  }

  publish(event: GraphEvent): void {
    this.events.push(event);
    for (const rule of this.rules) {
      if (rule.query(this)) {
        rule.action(this);
      }
    }
  }

  recordCounter(name: string, value: number): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  observeLatency(name: string, value: number): void {
    const samples = this.hist.get(name) ?? [];
    samples.push(value);
    if (samples.length > 2048) samples.shift();
    this.hist.set(name, samples);
  }

  addRule(rule: AlertRule<InMemoryTelemetryController>): void {
    this.rules.push(rule);
  }
}

export function percentile(samples: readonly number[], ratio: number): number {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.floor(ordered.length * ratio)));
  return ordered[index] ?? 0;
}

export function buildTelemetry(graph: GraphDefinition, ctx: GridContext): InMemoryTelemetryController {
  const ctl = new InMemoryTelemetryController(graph.id, ctx);
  ctl.recordCounter('graph.node.count', graph.nodes.length);
  ctl.recordCounter('graph.edge.count', graph.edges.length);
  ctl.setGauge('graph.revision', graph.ctx.revision);
  const resolver = createHealthReport(ctx, graph.nodes, graph.edges);
  ctl.observeLatency('graph.healthScore', resolver.summary.score);
  for (const [nodeId, metrics] of Object.entries(nodeHealth(graph.nodes))) {
    ctl.recordCounter(`node.${nodeId}.observed`, metrics.observed);
  }
  return ctl;
}

function nodeHealth(nodes: ReadonlyArray<{ id: NodeId; metrics: NodeMetrics }>): Readonly<Record<NodeId, NodeMetrics>> {
  const map = Object.create(null) as Record<NodeId, NodeMetrics>;
  for (const node of nodes) {
    map[node.id] = node.metrics;
  }
  return map;
}

export function nodeLoad(metrics: NodeMetrics): number {
  const numerator = metrics.observed + metrics.dropped + metrics.retried;
  const denominator = metrics.observed + metrics.dropped + 1;
  return numerator / denominator;
}

export function edgeLoad(edge: { metrics: { droppedPackets: number; throughput: number } }): number {
  return edge.metrics.throughput === 0 ? 0 : edge.metrics.droppedPackets / edge.metrics.throughput;
}

export function syntheticEvents(graph: GraphDefinition): readonly GraphEvent[] {
  const events: GraphEvent[] = [];
  for (const node of graph.nodes) {
    events.push({
      stamp: 0 as never,
      source: graph.id,
      type: 'updated',
      payload: { node: node.id },
    });
  }
  return events;
}

export const telemetryPresets: ReadonlyArray<{
  key: string;
  unit: string;
  limit: number;
}> = [
  { key: 'graph.node.count', unit: 'count', limit: 10_000 },
  { key: 'graph.edge.count', unit: 'count', limit: 20_000 },
  { key: 'node.delay', unit: 'ms', limit: 2_000 },
  { key: 'edge.dropout', unit: 'ratio', limit: 0.1 },
];

export function emitDefaults(controller: TelemetryController): void {
  const snapshot = controller.collect();
  for (const preset of telemetryPresets) {
    const counter = snapshot.counters.find((entry) => entry.name === preset.key);
    if (counter && counter.get() > preset.limit) {
      controller.publish({
        stamp: 0 as never,
        source: (controller as InMemoryTelemetryController).graph,
        type: 'updated',
        payload: { preset, current: counter.get() },
      });
    }
  }
}
