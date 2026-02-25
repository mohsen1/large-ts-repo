import {
  ScenarioDiagnostics,
  diagnosticsIterator,
  mapIterator,
  filterIterator,
  collectDiagnostics,
  DiagnosticId,
  type StageSample,
} from '@shared/scenario-design-kernel';
import type { ScenarioDesignEvent } from '../types';

export interface TelemetryEnvelope {
  readonly eventCount: number;
  readonly hasErrors: boolean;
  readonly samples: readonly StageSample[];
}

export function buildTelemetryFromEvents(events: readonly ScenarioDesignEvent[]): TelemetryEnvelope {
  const errors = events.filter((entry) => entry.type === 'scenario.failed').length;
  const all = Array.from(
    mapIterator(events, (event): StageSample<Record<string, number>> => ({
      stage: 'audit',
      elapsedMs: 0,
      metrics: { total: 1 },
      tags: [event.type],
      checkpoint: event.timestamp,
    })),
  );

  const samples = Array.from(
    mapIterator(
      filterIterator(all, (sample) => sample.tags[0] !== 'scenario.progress'),
      (sample) => sample,
    ),
  );

  return {
    eventCount: events.length,
    hasErrors: errors > 0,
    samples,
  };
}

export async function snapshotTelemetry(events: Iterable<ScenarioDesignEvent>): Promise<TelemetryEnvelope> {
  const diagnostics = new ScenarioDiagnostics<ScenarioDesignEvent>();

  for (const entry of events) {
    diagnostics.record({
      type: entry.type === 'scenario.failed' ? 'error' : entry.type === 'scenario.started' ? 'start' : 'snapshot',
      stage: 'ingress',
      payload: entry,
      id: `diag-${entry.runId}` as DiagnosticId,
    });
  }

  const envelope = await collectDiagnostics(diagnostics.events);
  const hasErrors = envelope.events.some((entry) => entry.type === 'error');

  const stages = Array.from(diagnosticsIterator(diagnostics.events), (entry) => entry.type);
  const samples = Array.from(
    mapIterator(
      diagnostics.events,
      (entry): StageSample<Record<string, number>> => ({
        stage: 'verification',
        elapsedMs: entry.time - envelope.startedAt,
        metrics: { elapsed: 1 },
        tags: [entry.type, ...stages],
        checkpoint: entry.time,
      }),
    ),
  );

  return {
    eventCount: envelope.events.length,
    hasErrors,
    samples,
  };
}

export function summarizeStages(telemetry: TelemetryEnvelope): string {
  const sampleCount = telemetry.samples.length;
  return `samples=${sampleCount}; errors=${telemetry.hasErrors}; events=${telemetry.eventCount}`;
}

export const diagnosticsState = {
  summary: summarizeStages,
} as const;
