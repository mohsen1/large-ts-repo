import {
  type RecoveryTimeline,
  type RecoveryTimelineEvent,
  type RecoveryTelemetrySnapshot,
  aggregateHealth,
} from '@domain/recovery-timeline';
import {
  type ConductorInput,
  type ConductorMode,
  type ConductorOutput,
  classifySamples,
  createConductorId,
  type RiskGradient,
  type ConductorPolicy,
  type ConductorProfile,
  type ConductorResult,
  deriveRiskBuckets,
} from './types';

export interface ForecastProjection {
  readonly windowStart: string;
  readonly horizonMinutes: number;
  readonly confidence: number;
  readonly samples: readonly RecoveryTelemetrySnapshot[];
}

export function buildForecastWindow(
  timeline: RecoveryTimeline,
  mode: ConductorMode,
  policy: ConductorPolicy<ConductorProfile>,
): ForecastProjection {
  const horizonMinutes = Math.max(5, policy.sampleWindow);
  const now = new Date();
  const windowStart = now.toISOString();

  const samples = timeline.events.map((event) => ({
    timelineId: timeline.id,
    source: 'timeline-orchestrator',
    measuredAt: new Date(event.start.getTime() + horizonMinutes * 60_000),
    confidence: Math.max(0, Math.min(1, 0.5 + event.riskScore / 120)),
    expectedReadyAt: new Date(event.end.getTime() + horizonMinutes * 60_000),
    actualReadyAt: event.state === 'completed' ? event.end : undefined,
    note: `${event.phase}:${event.state}`,
  }));

  const confidence = Math.min(
    0.99,
    Math.max(0.2, aggregateHealth(timeline.events).riskScoreAverage / 100),
  );
  return {
    windowStart,
    horizonMinutes,
    confidence: Math.min(confidence, policy.minConfidence),
    samples,
  };
}

export function trendFromSamples(events: readonly RecoveryTimelineEvent[]): RiskGradient {
  const scores = events.map((event) => event.riskScore);
  if (scores.length === 0) {
    return [0, 0, 0];
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const low = sorted.slice(0, mid).reduce((acc, value) => acc + value, 0) / Math.max(1, mid);
  const medium = sorted.slice(mid).reduce((acc, value) => acc + value, 0) / Math.max(1, sorted.length - mid);
  const high = sorted.at(-1) ?? 0;
  return [low, medium, high];
}

export function buildConductorOutput(
  input: ConductorInput,
  timeline: RecoveryTimeline,
  policy: ConductorPolicy<'adaptive'>,
): ConductorResult<ConductorOutput> {
  try {
    const sampleBuckets = classifySamples(timeline.events);
    const riskProfile = deriveRiskBuckets(sampleBuckets);
    const forecast = buildForecastWindow(timeline, input.mode, {
      profile: 'predictive',
      minConfidence: policy.minConfidence,
      sampleWindow: policy.sampleWindow,
      allowPartial: policy.allowPartial,
    });
    const pathSegments = timeline.events.map((event, index) => event.riskScore * (index + 1));

    return {
      ok: true,
      output: {
        id: createConductorId(input.mode),
        timelineId: timeline.id,
        mode: input.mode,
        riskProfile,
        timelineWindow: pathSegments,
        nextSteps: sampleBuckets.map((sample) => `${sample.phase}::${sample.band}`),
        snapshot: {
          timelineId: timeline.id,
          source: 'timeline-orchestrator',
          measuredAt: forecast.samples.at(-1)?.measuredAt ?? new Date(),
          confidence: forecast.confidence,
          expectedReadyAt: forecast.samples.at(-1)?.expectedReadyAt ?? new Date(),
          actualReadyAt: undefined,
          note: `${input.pluginNames.join('|')}`,
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error('orchestration failed'),
    };
  }
}

export function evaluateTimelineWindow(input: ConductorInput): number {
  const policyScore = input.windowMinutes * input.pluginNames.length;
  return policyScore;
}

export function sequenceFromEvents(events: readonly RecoveryTimelineEvent[]): readonly RecoveryTimelineEvent[] {
  return [...events].sort((left, right) => left.start.getTime() - right.start.getTime());
}
