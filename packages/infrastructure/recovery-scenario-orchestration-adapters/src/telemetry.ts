import type { RuntimeMetrics, ScenarioDecision } from '@domain/recovery-scenario-engine';

export interface ScenarioTrace {
  scenarioId: string;
  incidentId: string;
  decision: ScenarioDecision;
  metrics: RuntimeMetrics;
  emittedAt: string;
}

export interface TraceCollector {
  push(trace: ScenarioTrace): void;
  all(): readonly ScenarioTrace[];
  flush(): readonly ScenarioTrace[];
}

export class MemoryTraceCollector implements TraceCollector {
  #rows: ScenarioTrace[];

  constructor() {
    this.#rows = [];
  }

  push(trace: ScenarioTrace): void {
    this.#rows.push(trace);
  }

  all(): readonly ScenarioTrace[] {
    return [...this.#rows];
  }

  flush(): readonly ScenarioTrace[] {
    const emitted = [...this.#rows];
    this.#rows = [];
    return emitted;
  }
}

export const toTrace = (trace: ScenarioTrace): string => {
  return JSON.stringify({
    ...trace,
    emittedAt: new Date(trace.emittedAt).toISOString(),
  });
};
