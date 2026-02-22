import type { OrchestrationRun, OrchestrationManifest, OrchestrationId } from './blueprint';
import type { GraphEvent } from '@domain/nebula-grid/src/primitives';

export interface TraceSpan {
  readonly id: string;
  readonly name: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly children: TraceSpan[];
}

export interface TraceRecord {
  readonly runId: string;
  readonly graph: string;
  readonly manifest: OrchestrationManifest;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly events: ReadonlyArray<GraphEvent>;
}

export type TraceStore = Map<string, TraceRecord>;

export function startTrace(run: OrchestrationRun, manifest: OrchestrationManifest): TraceRecord {
  return {
    runId: run.id,
    graph: manifest.blueprint.graph,
    manifest,
    startedAt: Date.now(),
    events: [],
  };
}

export function attachEvent(trace: TraceRecord, event: GraphEvent): TraceRecord {
  return {
    ...trace,
    events: [...trace.events, event],
  };
}

export function stopTrace(trace: TraceRecord): TraceRecord {
  return {
    ...trace,
    endedAt: Date.now(),
  };
}

export class TraceCollector {
  private readonly store: TraceStore;
  constructor(private readonly capacity = 2048) {
    this.store = new Map<string, TraceRecord>();
  }

  create(run: OrchestrationRun, manifest: OrchestrationManifest): string {
    const trace = startTrace(run, manifest);
    this.store.set(trace.runId, trace);
    this.prune();
    return trace.runId;
  }

  append(runId: OrchestrationId, event: GraphEvent): void {
    const trace = this.store.get(runId);
    if (!trace) return;
    this.store.set(runId, attachEvent(trace, event));
  }

  finish(runId: OrchestrationId): TraceRecord | undefined {
    const trace = this.store.get(runId);
    if (!trace) return;
    const done = stopTrace(trace);
    this.store.set(runId, done);
    return done;
  }

  all(): readonly TraceRecord[] {
    return Array.from(this.store.values());
  }

  private prune(): void {
    if (this.store.size <= this.capacity) return;
    const first = this.store.keys().next().value;
    if (first) this.store.delete(first);
  }
}

export const EventSamples = Array.from({ length: 500 }, (_, idx) => ({
  stamp: (Date.now() + idx) as never,
  source: `graph-${idx}` as const,
  type: idx % 2 === 0 ? 'added' : 'removed',
  payload: {
    eventId: `ev-${idx}`,
    created: Date.now() + idx,
    node: `node-${idx}`,
    status: idx % 2 === 0 ? 'start' : 'stop',
  },
} as GraphEvent));
