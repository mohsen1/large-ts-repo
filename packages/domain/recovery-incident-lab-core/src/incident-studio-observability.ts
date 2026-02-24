import { Brand, withBrand } from '@shared/core';
import type { IncidentLabPlan, IncidentLabRun, IncidentLabSignal } from './types';
import { buildSignalEnvelope } from './incident-studio-signals';
import { buildPlanTimeline, type OrchestrationTimelineFrame } from './incident-studio-schedule';

export const telemetryBuckets = ['all', 'signal', 'plan', 'lane', 'plugin', 'network'] as const;
export type TelemetryBucket = (typeof telemetryBuckets)[number];

export type TelemetryFrame<TBucket extends TelemetryBucket = TelemetryBucket> = {
  readonly frameId: Brand<string, 'IncidentLabStudioTelemetryFrame'>;
  readonly bucket: TBucket;
  readonly sessionId: string;
  readonly at: string;
  readonly score: number;
  readonly details: Readonly<Record<string, unknown>>;
};

export interface StudioTelemetrySnapshot<T> {
  readonly bucket: TelemetryBucket;
  readonly payload: T;
  readonly signature: Brand<string, 'IncidentLabStudioTelemetrySignature'>;
}

export interface StudioTelemetryState {
  readonly sessionId: string;
  readonly frames: number;
  readonly buckets: readonly TelemetryBucket[];
  readonly warnings: readonly string[];
  readonly updatedAt: string;
}

export type IncidentLabTelemetryState = StudioTelemetryState;

const brandSignature = (input: string): Brand<string, 'IncidentLabStudioTelemetrySignature'> =>
  withBrand(`telemetry:${input}:${Date.now()}`, 'IncidentLabStudioTelemetrySignature');

const createTelemetryFrame = <T extends TelemetryBucket>(
  sessionId: string,
  bucket: T,
  details: Readonly<Record<string, unknown>> = {},
): TelemetryFrame<T> => ({
  frameId: withBrand(`${sessionId}:${bucket}:${Date.now()}`, 'IncidentLabStudioTelemetryFrame'),
  bucket,
  sessionId,
  at: new Date().toISOString(),
  score: 10 + Object.keys(details).length,
  details,
});

export const reduceBuckets = (frames: readonly TelemetryFrame[]): Readonly<Record<TelemetryBucket, number>> =>
  telemetryBuckets.reduce((acc, bucket) => {
    const count = frames.filter((frame) => frame.bucket === bucket).length;
    return { ...acc, [bucket]: count } as Readonly<Record<TelemetryBucket, number>>;
  }, {} as Record<TelemetryBucket, number>);

export const summarizeTelemetry = (frames: readonly TelemetryFrame[]): {
  readonly signature: Brand<string, 'IncidentLabStudioTelemetrySignature'>;
  readonly bucketCounts: Readonly<Record<TelemetryBucket, number>>;
  readonly summary: string;
  readonly total: number;
} => {
  const bucketCounts = telemetryBuckets.reduce<Record<TelemetryBucket, number>>((acc, bucket) => {
    const value = frames.reduce<number>((seed, frame) => seed + (frame.bucket === bucket ? 1 : 0), 0);
    return { ...acc, [bucket]: value };
  }, { all: 0, signal: 0, plan: 0, lane: 0, plugin: 0, network: 0 });

  const total = frames.length;
  return {
    signature: brandSignature(`count-${total}`),
    bucketCounts,
    summary: Object.entries(bucketCounts).map(([bucket, value]) => `${bucket}:${value}`).join(','),
    total,
  };
};

const collectPlanTelemetry = (plan: IncidentLabPlan): readonly TelemetryFrame[] =>
  buildPlanTimeline({ plan, startAt: new Date().toISOString(), strategy: 'dependency-first' }, 16).map((frame, index) =>
    createTelemetryFrame(plan.id, frame.stage === 'execute' ? 'plan' : 'plugin', { window: frame.signature, index }),
  );

const collectRunTelemetry = (run: IncidentLabRun): readonly TelemetryFrame[] =>
  run.results.map((entry, index) => createTelemetryFrame(run.runId, 'signal', { step: entry.stepId, status: entry.status, index }));

const collectSignalTelemetry = (signals: readonly IncidentLabSignal[]): readonly TelemetryFrame[] =>
  signals.slice(0, 32).map((signal, index) => createTelemetryFrame(signal.kind, 'signal', { signal: signal.node, value: signal.value, index }));

const collectEnvelopeTelemetry = (signals: readonly IncidentLabSignal[]): readonly TelemetryFrame[] =>
  signals
    .slice(0, 16)
    .map((signal) => buildSignalEnvelope({
      sessionId: signal.node,
      scenarioId: signal.kind,
      lane: signal.kind,
      values: [signal],
      payload: { node: signal.node, value: signal.value },
    }))
    .map((envelope) => createTelemetryFrame(`${envelope.signalEnvelopeId}`, 'network', {
      envelope: envelope.id,
      signature: envelope.signalEnvelopeId,
    }));

export class IncidentLabTelemetryBuffer implements AsyncDisposable {
  private readonly frames: TelemetryFrame[] = [];
  private readonly maxFrames: number;
  private closed = false;

  public constructor(private readonly sessionId: string, maxFrames: number = 128) {
    this.maxFrames = Math.max(16, maxFrames);
  }

  public record<T extends TelemetryBucket>(bucket: T, details: Readonly<Record<string, unknown>> = {}): TelemetryFrame<T> {
    const frame = createTelemetryFrame(this.sessionId, bucket, details);
    this.frames.unshift(frame);
    this.frames.length = Math.min(this.frames.length, this.maxFrames);
    return frame;
  }

  public snapshot(): {
    readonly state: StudioTelemetryState;
    readonly diagnostics: string[];
  } {
    const summary = summarizeTelemetry(this.frames);
    const buckets = telemetryBuckets.filter((bucket) => this.frames.some((frame) => frame.bucket === bucket));
    return {
      state: {
        sessionId: this.sessionId,
        frames: this.frames.length,
        buckets,
        warnings: buckets.flatMap((bucket) => this.frames.filter((frame) => frame.bucket === bucket).map((frame) => frame.frameId)),
        updatedAt: new Date().toISOString(),
      },
      diagnostics: [summary.summary],
    };
  }

  public loadPlan(plan: IncidentLabPlan): void {
    for (const frame of collectPlanTelemetry(plan)) {
      this.frames.unshift(frame);
      if (this.frames.length > this.maxFrames) {
        this.frames.pop();
      }
    }
  }

  public loadRun(run: IncidentLabRun): void {
    for (const frame of collectRunTelemetry(run)) {
      this.frames.unshift(frame);
      if (this.frames.length > this.maxFrames) {
        this.frames.pop();
      }
    }
  }

  public loadSignals(signals: readonly IncidentLabSignal[]): void {
    for (const frame of [...collectSignalTelemetry(signals), ...collectEnvelopeTelemetry(signals)]) {
      this.frames.unshift(frame);
      if (this.frames.length > this.maxFrames) {
        this.frames.pop();
      }
    }
  }

  public toTimeline(): {
    readonly frames: readonly TelemetryFrame[];
    readonly summary: ReturnType<typeof summarizeTelemetry>;
  } {
    const snapshot = [...this.frames].toSorted((left, right) => right.at.localeCompare(left.at)).slice(0, this.maxFrames);
    return {
      frames: snapshot,
      summary: summarizeTelemetry(snapshot),
    };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    this.frames.length = 0;
    return Promise.resolve();
  }

  public toStateFrame(): StudioTelemetryState {
    const { state } = this.snapshot();
    return state;
  }
}
