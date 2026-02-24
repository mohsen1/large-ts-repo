export interface MetricSeries {
  readonly name: string;
  readonly points: readonly number[];
}

export interface TelemetryState {
  readonly entries: Map<string, MetricSeries>;
}

export interface TelemetryEvent {
  readonly runId: string;
  readonly name: string;
  readonly value: number;
  readonly at: number;
}

const defaultSeries = (name: string): MetricSeries => ({ name, points: [] });

export const createTelemetryState = (): TelemetryState => ({
  entries: new Map<string, MetricSeries>([['throughput', defaultSeries('throughput')]]),
});

export const emitTelemetry = (state: TelemetryState, event: TelemetryEvent): TelemetryState => {
  const next = new Map(state.entries);
  const existing = next.get(event.name) ?? defaultSeries(event.name);
  const merged = {
    name: event.name,
    points: [...existing.points, event.value].slice(-128),
  };
  next.set(event.name, merged);
  return { entries: next };
};

export const latestValue = (state: TelemetryState, name: string): number | undefined =>
  state.entries.get(name)?.points.at(-1);

export const averageValue = (state: TelemetryState, name: string): number => {
  const points = state.entries.get(name)?.points ?? [];
  if (points.length === 0) return 0;
  const total = points.reduce((sum, point) => sum + point, 0);
  return total / points.length;
};

export const snapshotMetrics = (state: TelemetryState): readonly TelemetryEvent[] =>
  [...state.entries.values()].map((series, index) => ({
    runId: `snapshot-${index}`,
    name: series.name,
    value: averageValue(state, series.name),
    at: Date.now(),
  }));

export const detectTrend = (state: TelemetryState, name: string): 'up' | 'down' | 'flat' => {
  const points = state.entries.get(name)?.points ?? [];
  if (points.length < 2) return 'flat';
  const head = points.at(-2) ?? 0;
  const tail = points.at(-1) ?? 0;
  return tail > head ? 'up' : tail < head ? 'down' : 'flat';
};

export class TelemetryWindow {
  #state: TelemetryState;
  constructor(initial?: TelemetryState) {
    this.#state = initial ?? createTelemetryState();
  }

  get state(): TelemetryState {
    return this.#state;
  }

  push(name: string, value: number, runId: string): TelemetryEvent {
    this.#state = emitTelemetry(this.#state, { runId, name, value, at: Date.now() });
    return {
      runId,
      name,
      value,
      at: Date.now(),
    };
  }

  snapshot(): readonly TelemetryEvent[] {
    return snapshotMetrics(this.#state);
  }
}
