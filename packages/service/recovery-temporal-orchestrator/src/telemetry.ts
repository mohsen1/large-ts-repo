import { summarizeTrace, makeTraceRecord } from '@shared/temporal-ops-runtime/temporal-pipeline';
import { isoNow, type Brand, type EntityId, type IsoTimestamp, type TemporalEnvelope } from '@shared/temporal-ops-runtime';
import {
  createBundleNode,
  type DefaultBundle,
} from '@domain/recovery-temporal-orchestration/defaults';
import type {
  TemporalRunbook,
  OrchestrationSignal,
  TemporalPhase,
  TimelineNode,
} from '@domain/recovery-temporal-orchestration';

export interface TelemetryRecord {
  readonly id: string;
  readonly runId: string;
  readonly at: IsoTimestamp;
  readonly phase: TemporalPhase | 'snapshot';
  readonly status: 'ok' | 'warn' | 'error';
  readonly message: string;
}

export class TimelineTelemetry {
  readonly #records: TelemetryRecord[] = [];

  record(phase: TemporalPhase | 'snapshot', status: TelemetryRecord['status'], message: string, runId: string): void {
    this.#records.push({
      id: `telemetry:${Math.random().toString(36).slice(2)}`,
      runId,
      at: isoNow(),
      phase,
      status,
      message,
    });
  }

  summarize(): readonly TelemetryRecord[] {
    return this.#records.toSorted((left, right) => left.at.localeCompare(right.at));
  }

  toSignals(runId: Brand<string, 'RunId'>): readonly OrchestrationSignal<'domain', TelemetryRecord>[] {
    return this.#records.map((record): OrchestrationSignal<'domain', TelemetryRecord> => ({
      signalId: `signal:${record.id}` as EntityId,
      type: 'signal:domain',
      issuedAt: record.at,
      runId,
      ttlMs: 2_000,
      severity: record.status === 'error' ? 'critical' : record.status === 'warn' ? 'medium' : 'low',
      payload: record,
    }));
  }
}

export const emitRunbookSnapshot = <TMeta>(
  runbook: TemporalRunbook<TMeta>,
  bundle: DefaultBundle,
  telemetry: TimelineTelemetry,
): readonly TemporalEnvelope<string, RunbookSnapshotRecord>[] => {
  const signal = createBundleNode('snapshot', bundle.defaultsRunId, String(bundle.labels.scope));
  telemetry.record('snapshot', 'ok', `snapshot=${signal}`, String(runbook.runId));

  const envelopes = summarizeTrace(
    runbook.nodes
      .map((node, index) =>
        makeTraceRecord(
          `runbook:${runbook.runId}:${index}`,
          runbook.runId,
          node,
          {
            index,
            summary: node.name,
          } as const,
        ),
      )
      .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt)),
  );

  return envelopes as readonly TemporalEnvelope<string, RunbookSnapshotRecord<TMeta>>[];
};

type RunbookSnapshotRecord<TMeta = unknown> = {
  readonly stage: string;
  readonly recordedAt: IsoTimestamp;
  readonly runId: Brand<string, 'RunId'>;
  readonly value: {
    readonly input: TimelineNode<TMeta>;
    readonly output: {
      readonly index: number;
      readonly summary: string;
    };
  };
};
