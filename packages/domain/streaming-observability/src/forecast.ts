import { ThroughputRecord } from './types';

export interface ThroughputForecast {
  streamId: string;
  windowStart: number;
  windowEnd: number;
  predictedEventsPerSecond: number;
  confidence: number;
  recommendedParallelism: number;
}

export interface ForecastInput {
  streamId: string;
  history: ThroughputRecord[];
  targetWindowMs: number;
}

export const forecastThroughput = (input: ForecastInput): ThroughputForecast => {
  if (input.history.length === 0) {
    return {
      streamId: input.streamId,
      windowStart: Date.now(),
      windowEnd: Date.now() + input.targetWindowMs,
      predictedEventsPerSecond: 0,
      confidence: 0.1,
      recommendedParallelism: 1,
    };
  }

  const total = input.history.reduce((acc, sample) => acc + sample.eventsPerSecond, 0);
  const avg = total / input.history.length;
  const sorted = [...input.history].sort((a, b) => a.eventsPerSecond - b.eventsPerSecond);
  const median = sorted[Math.floor(sorted.length / 2)]?.eventsPerSecond ?? avg;
  const slope = computeSlope(input.history);

  const predicted = Math.max(0, avg + slope * (input.targetWindowMs / 60000));
  const confidence = Math.max(0.2, Math.min(0.98, 1 - Math.abs(predicted - median) / Math.max(median, 1)));
  const recommendedParallelism = Math.max(1, Math.round(predicted / 1200));

  return {
    streamId: input.streamId,
    windowStart: Date.now(),
    windowEnd: Date.now() + input.targetWindowMs,
    predictedEventsPerSecond: Math.round(predicted),
    confidence: Number(confidence.toFixed(2)),
    recommendedParallelism,
  };
};

const computeSlope = (samples: readonly ThroughputRecord[]): number => {
  if (samples.length < 2) return 0;
  let numerator = 0;
  let denominator = 0;
  const baseline = samples[0].eventsPerSecond;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].eventsPerSecond;
    const current = samples[index].eventsPerSecond;
    const delta = current - previous;
    numerator += delta;
    denominator += 1;
  }
  if (!denominator) return 0;
  return numerator / denominator;
};
