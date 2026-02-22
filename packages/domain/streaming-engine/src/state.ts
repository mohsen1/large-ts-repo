import { StreamId, StreamMetrics } from './types';

export interface WindowState {
  start: number;
  end: number;
  key: string;
  aggregate: number;
}

export interface StateStore {
  put(key: string, value: WindowState): void;
  get(key: string): WindowState | undefined;
  clear(): void;
}

export class InMemoryStateStore implements StateStore {
  private readonly states = new Map<string, WindowState>();
  put(key: string, value: WindowState): void {
    this.states.set(key, value);
  }
  get(key: string): WindowState | undefined {
    return this.states.get(key);
  }
  clear(): void {
    this.states.clear();
  }
}

export function mergeWindows(base: WindowState, next: WindowState): WindowState {
  return {
    start: Math.min(base.start, next.start),
    end: Math.max(base.end, next.end),
    key: base.key,
    aggregate: base.aggregate + next.aggregate,
  };
}

export function windowCoverage(states: readonly WindowState[]): number {
  return states.reduce((acc, state) => acc + Math.max(0, state.end - state.start), 0);
}

export function toMetrics(stream: StreamId, lag: number): StreamMetrics {
  return { stream, throughput: { eventsPerSecond: 0, bytesPerSecond: 0 }, lag, consumerGroups: [] };
}
