import { AlertMatch, NormalizedTelemetrySample, PolicyContext, PolicyRule, TelemetryEnvelope, TimestampMs, WindowBoundary } from '@domain/telemetry-models';
import { bucketEvents, summarizeBuckets } from '@domain/telemetry-models';
import { evaluatePolicy, rankMatches } from '@domain/telemetry-models';
import { summarizeBySignal } from './events';

export interface PipelineInput {
  samples: readonly NormalizedTelemetrySample[];
  policies: readonly PolicyRule[];
  boundaryWindowMs: number;
}

export interface PipelineReport {
  envelopes: TelemetryEnvelope[];
  matches: AlertMatch[];
  bySignal: Record<string, number>;
  buckets: number;
}

export const runPipeline = async (input: PipelineInput): Promise<PipelineReport> => {
  const normalized = input.samples
    .map((sample) => ({
      sample,
      envelope: makeEnvelope(sample),
    }));

  const bySignal = summarizeBySignal(normalized.map((entry) => entry.envelope));

  const window = {
    start: 0 as TimestampMs,
    end: input.boundaryWindowMs as TimestampMs,
    grainMs: input.boundaryWindowMs,
  };
  const buckets = bucketEvents(input.samples, window);
  const summary = summarizeBuckets(input.samples, [window]);
  const boundary: WindowBoundary<typeof window> = (input.boundaryWindowMs === 1000 ? 'second' : 'custom') as any;

  const matches = rankMatches(
    normalized.flatMap(({ sample }) =>
      input.policies.map((rule) => evaluatePolicy(rule, {
        now: Date.now() as TimestampMs,
        sample,
        windowSamples: [sample],
      }))
    ).filter((match): match is AlertMatch => Boolean(match)),
  );

  return {
    envelopes: normalized.map((entry) => entry.envelope),
    matches,
    bySignal,
    buckets: summary.totalEvents,
  };
};

const makeEnvelope = (sample: NormalizedTelemetrySample): TelemetryEnvelope => ({
  id: `${sample.tenantId}-${sample.streamId}-${sample.timestamp}` as TelemetryEnvelope['id'],
  sample,
  fingerprint: `${sample.streamId}:${sample.timestamp}:${JSON.stringify(sample.payload)}`,
  createdAt: sample.timestamp,
});
