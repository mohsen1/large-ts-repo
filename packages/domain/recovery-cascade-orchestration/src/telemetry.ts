import { EventRecord } from '@shared/cascade-orchestration-kernel';

export interface TelemetryMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: 'ms' | 'count' | 'ratio';
}

export interface TelemetryEnvelope {
  readonly runId: string;
  readonly tenantId: string;
  readonly metrics: TelemetryMetric[];
  readonly events: EventRecord[];
}

export const metric = (name: string, value: number, unit: TelemetryMetric['unit'] = 'count'): TelemetryMetric => ({
  name,
  value,
  unit,
});

export const metricsForRun = (runId: string, tenantId: string, events: EventRecord[]): TelemetryEnvelope => {
  const grouped = new Map<string, number>();
  for (const event of events) {
    const key = event.kind;
    const current = grouped.get(key) ?? 0;
    grouped.set(key, current + 1);
  }

  return {
    runId,
    tenantId,
    events,
    metrics: [...grouped.entries()].map(([name, count]) => ({
      name: `event.${name}`,
      value: count,
      unit: 'count',
    })),
  };
};
