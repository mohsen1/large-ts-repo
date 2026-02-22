import { type GraphDefinition, type NodeId, type EdgeId, type GraphId, type GridContext, ThroughputWindow } from './primitives';

export interface WorkChunk {
  readonly id: string;
  readonly graph: GraphId;
  readonly node: NodeId;
  readonly edge?: EdgeId;
  readonly priority: number;
  readonly payload: unknown;
}

export type WorkSlice = readonly WorkChunk[];
export type WorkerPhase = 'prepare' | 'execute' | 'finalize' | 'idle';
export type WorkerMetric = { [K in WorkerPhase]: number };

export interface PhaseWindow {
  readonly phase: WorkerPhase;
  readonly startedAt: number;
  readonly endedAt: number;
}

export interface SchedulerSettings {
  readonly prefetch: number;
  readonly backlogLimit: number;
  readonly dispatchMode: 'round-robin' | 'least-latency' | 'least-batch';
  readonly heartbeatMs: number;
}

export interface ExecutionPlan {
  readonly id: string;
  readonly graph: GraphDefinition;
  readonly work: WorkSlice;
  readonly settings: SchedulerSettings;
  readonly createdAt: number;
}

export interface Worker {
  readonly id: string;
  readonly region: string;
  readonly inFlight: number;
  readonly maxInflight: number;
  readonly skills: ReadonlyArray<string>;
}

export interface SchedulingSummary {
  readonly planId: string;
  readonly completed: number;
  readonly failed: number;
  readonly queued: number;
  readonly elapsedMs: number;
  readonly phaseDurations: WorkerMetric;
}

export class SchedulerEngine {
  private readonly phases = new Map<WorkerPhase, number>([
    ['prepare', 0],
    ['execute', 0],
    ['finalize', 0],
    ['idle', 0],
  ]);
  private readonly queue: WorkChunk[] = [];
  private readonly workers: Worker[] = [];
  private readonly settings: SchedulerSettings;

  constructor(private readonly ctx: GridContext, settings: Partial<SchedulerSettings> = {}) {
    this.settings = {
      prefetch: settings.prefetch ?? 128,
      backlogLimit: settings.backlogLimit ?? 8_000,
      dispatchMode: settings.dispatchMode ?? 'least-latency',
      heartbeatMs: settings.heartbeatMs ?? 400,
    };
  }

  enqueue(plan: ExecutionPlan): void {
    for (const work of plan.work) {
      if (this.queue.length >= this.settings.backlogLimit) break;
      this.queue.push(work);
    }
  }

  registerWorker(worker: Worker): void {
    this.workers.push(worker);
  }

  buildMetricsWindow(window: ThroughputWindow): WorkerMetric {
    const scale = Math.max(1, Math.min(1, window.targetRps / 10_000));
    const targetMs = window.maxBurst * scale;
    return {
      prepare: targetMs * 0.2,
      execute: targetMs * 0.5,
      finalize: targetMs * 0.2,
      idle: 1 - targetMs * 0.1,
    };
  }

  tick(): SchedulingSummary {
    const start = Date.now();
    this.phases.set('prepare', Date.now());
    const work = this.dispatch();

    const completed = work.filter((job) => job.node !== `failed-${this.ctx.id}`).length;
    const failed = work.length - completed;

    this.phases.set('execute', Date.now());
    this.phases.set('finalize', Date.now());

    const elapsedMs = Date.now() - start;
    return {
      planId: `plan-${this.ctx.id}`,
      completed,
      failed,
      queued: this.queue.length,
      elapsedMs,
      phaseDurations: {
        prepare: this.phases.get('prepare') ?? 0,
        execute: this.phases.get('execute') ?? 0,
        finalize: this.phases.get('finalize') ?? 0,
        idle: this.phases.get('idle') ?? 0,
      },
    };
  }

  private dispatch(): WorkChunk[] {
    const batch = this.queue.splice(0, this.settings.prefetch);
    const result: WorkChunk[] = [];

    const ready = [...batch];
    const ranked = this.rankChunks(ready);
    const slices = this.chunk(ranked, this.workers.length || 1);

    for (let i = 0; i < slices.length; i += 1) {
      const slice = slices[i];
      const worker = this.pickWorker(slice[0]?.node, i);
      if (!worker) continue;
      for (const chunk of slice) {
        if (worker.inFlight >= worker.maxInflight) {
          result.push({ ...chunk, id: `${chunk.id}::pending` });
          continue;
        }
        result.push({
          ...chunk,
          id: `${chunk.id}::${worker.id}`,
        });
      }
    }

    return result;
  }

  private rankChunks(chunks: WorkSlice): WorkSlice {
    if (this.settings.dispatchMode === 'least-latency') return chunks.toSorted((a, b) => a.priority - b.priority);
    if (this.settings.dispatchMode === 'least-batch') return chunks.toSorted((a, b) => a.id.length - b.id.length);
    return chunks.toSorted((a, b) => b.priority - a.priority);
  }

  private pickWorker(node: NodeId | undefined, index: number): Worker | undefined {
    if (this.workers.length === 0) return undefined;
    const workerIdx = Math.abs((node ? node.length : index) % this.workers.length);
    return this.workers[workerIdx];
  }

  private chunk<T>(items: readonly T[], size: number): readonly T[][] {
    if (size <= 0) return [Array.from(items)];
    const output: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      output.push(Array.from(items.slice(i, i + size)));
    }
    return output;
  }
}

export function planFromGraph(graph: GraphDefinition, window: ThroughputWindow, ctx: GridContext): ExecutionPlan {
  const work = graph.nodes.flatMap((node, nodeIdx) =>
    graph.edges
      .filter((edge) => edge.from === node.id)
      .map((edge, edgeIdx) => ({
        id: `${graph.id}-${nodeIdx}-${edgeIdx}`,
        graph: graph.id,
        node: edge.from,
        edge: edge.id,
        priority: (nodeIdx + edgeIdx) % 100,
        payload: { node, edge, window },
      })),
  );

  return {
    id: `plan-${graph.id}`,
    graph,
    work,
    settings: {
      prefetch: 128,
      backlogLimit: Math.max(1000, work.length),
      dispatchMode: 'least-latency',
      heartbeatMs: 400,
    },
    createdAt: Date.now(),
  };
}

export function rebalanceWorkers(workers: readonly Worker[]): Worker[] {
  return workers
    .slice()
    .sort((left, right) => left.inFlight - right.inFlight)
    .map((worker, idx) => ({
      ...worker,
      id: `${worker.id}-${idx}`,
    }));
}

export function drainQueue(engine: SchedulerEngine): WorkChunk[] {
  const all: WorkChunk[] = [];
  let step = 0;
  while (step < 20) {
    const phase = engine.tick();
    all.push({ id: `summary-${step}`, graph: `graph-${phase.planId}`, node: `node-${step}` as never, priority: phase.failed, payload: phase });
    if (phase.queued === 0) break;
    step += 1;
  }
  return all;
}

export function heartbeat(engine: SchedulerEngine, window: ThroughputWindow): WorkerMetric {
  return engine.buildMetricsWindow(window);
}

export const defaultSchedulers = Array.from({ length: 24 }).map((_, idx) => ({
  prefetch: 32 + idx,
  backlogLimit: 500 + idx * 10,
  dispatchMode: ['round-robin', 'least-latency', 'least-batch'][idx % 3] as SchedulerSettings['dispatchMode'],
  heartbeatMs: 200 + idx * 10,
}));
