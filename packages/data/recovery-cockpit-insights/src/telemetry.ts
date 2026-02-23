import { CommandEvent } from '@domain/recovery-cockpit-models';

export type TelemetryBatch = {
  readonly planId: string;
  readonly runId: string;
  readonly totalEvents: number;
  readonly failedEvents: number;
};

export type TelemetryEmitter = {
  emit(batch: TelemetryBatch): Promise<void>;
};

export const createConsoleEmitter = (prefix: string): TelemetryEmitter => ({
  async emit(batch) {
    void `${prefix}${batch.planId}${batch.runId}${batch.totalEvents}${batch.failedEvents}`;
  },
});

export const emitFromEvents = (events: readonly CommandEvent[]): TelemetryBatch => {
  const runId = events.at(0)?.runId ?? 'run:unknown';
  const planId = events.at(0)?.planId ?? 'plan:unknown';
  const failedEvents = events.filter((event) => event.status === 'failed').length;
  return {
    planId,
    runId,
    totalEvents: events.length,
    failedEvents,
  };
};
