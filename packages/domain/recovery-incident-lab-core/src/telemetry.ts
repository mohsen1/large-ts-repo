import type { IncidentLabEnvelope, IncidentLabRun, IncidentLabSignal, IncidentLabScenario, IncidentLabPlan, RunEvent, LabEventBus } from './types';

export interface TelemetrySnapshot {
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
  readonly run: IncidentLabRun;
  readonly signals: readonly IncidentLabSignal[];
}

export interface TelemetryIndex {
  readonly byScenario: Record<string, number>;
  readonly byPlan: Record<string, number>;
}

export interface TelemetryBatch {
  readonly items: readonly IncidentLabEnvelope<unknown>[];
  readonly createdAt: string;
}

export const createTelemetryIndex = (): TelemetryIndex => ({ byScenario: {}, byPlan: {} });

export const registerTelemetry = (snapshot: TelemetrySnapshot, index: TelemetryIndex): TelemetryIndex => {
  const next: TelemetryIndex = {
    byScenario: { ...index.byScenario },
    byPlan: { ...index.byPlan },
  };

  next.byScenario[snapshot.scenario.id] = (next.byScenario[snapshot.scenario.id] ?? 0) + 1;
  next.byPlan[snapshot.plan.id] = (next.byPlan[snapshot.plan.id] ?? 0) + 1;
  return next;
};

export const summarizeSignals = (signals: readonly IncidentLabSignal[]): { readonly [K in IncidentLabSignal['kind']]: number } => {
  const buckets: { capacity: number; latency: number; integrity: number; dependency: number } = {
    capacity: 0,
    latency: 0,
    integrity: 0,
    dependency: 0,
  };

  for (const signal of signals) {
    if (signal.kind === 'capacity') {
      buckets.capacity += signal.value;
    } else if (signal.kind === 'latency') {
      buckets.latency += signal.value;
    } else if (signal.kind === 'integrity') {
      buckets.integrity += signal.value;
    } else {
      buckets.dependency += signal.value;
    }
  }

  return buckets;
};

export const latestSignal = (signals: readonly IncidentLabSignal[], kind: IncidentLabSignal['kind']): IncidentLabSignal | undefined =>
  [...signals].reverse().find((signal) => signal.kind === kind);

export const createBus = <T>(): LabEventBus<T> => {
  const handlers: Array<(event: T) => void> = [];
  return {
    publish(event: T): void {
      for (const handler of handlers) {
        handler(event);
      }
    },
    subscribe(handler: (event: T) => void): () => void {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      };
    },
  };
};

export const batchTelemetry = (events: readonly RunEvent[]): TelemetryBatch => ({
  items: events.map((event) => ({
    id: `${event.id}:telemetry` as IncidentLabEnvelope<IncidentLabSignal>['id'],
    labId: 'lab-metrics' as IncidentLabEnvelope<IncidentLabSignal>['labId'],
    scenarioId: `${event.id}` as IncidentLabEnvelope<IncidentLabSignal>['scenarioId'],
    payload: event.output,
    createdAt: new Date().toISOString(),
    origin: 'runtime',
  })),
  createdAt: new Date().toISOString(),
});

export const buildTelemetrySummary = (run: IncidentLabRun): string => {
  const last = run.results[run.results.length - 1]?.stepId;
  return JSON.stringify({
    runId: run.runId,
    scenarioId: run.scenarioId,
    stepCount: run.results.length,
    status: run.state,
    lastStep: String(last),
  });
};
