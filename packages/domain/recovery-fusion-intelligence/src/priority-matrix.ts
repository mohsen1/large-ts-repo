import type {
  FusionWave,
  FusionSignal,
  FusionReadinessState,
} from './types';

export type FusionPriorityBand = 'critical' | 'high' | 'normal' | 'low' | 'noise';

export interface FusionSignalWeight {
  readonly signal: FusionSignal;
  readonly baseline: number;
  readonly urgency: number;
  readonly stability: number;
  readonly confidence: number;
}

export interface WavePriorityMatrix {
  readonly waveId: FusionWave['id'];
  readonly band: FusionPriorityBand;
  readonly score: number;
  readonly recommended: readonly string[];
  readonly contributors: readonly FusionSignalWeight[];
}

export interface PriorityContext {
  readonly tenant: string;
  readonly maxCommands: number;
  readonly minWaveScore: number;
  readonly minSignalConfidence: number;
}

const statePressure = (state: FusionReadinessState): number => {
  switch (state) {
    case 'failed':
      return 1;
    case 'blocked':
      return 0.9;
    case 'degraded':
      return 0.75;
    case 'running':
      return 0.6;
    case 'warming':
      return 0.5;
    case 'stable':
      return 0.3;
    default:
      return 0.2;
  }
};

const signalSeverityWeight = (signal: FusionSignal): number => {
  if (signal.severity >= 5) return 1;
  if (signal.severity >= 4) return 0.75;
  if (signal.severity >= 2) return 0.5;
  return 0.15;
};

const confidenceWeight = (signal: FusionSignal): number =>
  signal.payload?.confidence && Number.isFinite(signal.payload.confidence)
    ? Number(signal.payload.confidence as number)
    : 0.5;

const ownerWeight = (signal: FusionSignal): number => {
  if (signal.tags.includes('security')) {
    return 0.9;
  }
  if (signal.tags.includes('platform')) {
    return 0.75;
  }
  if (signal.tags.includes('sre')) {
    return 0.6;
  }
  return 0.35;
};

const normalizeSignal = (signal: FusionSignal, wave: FusionWave): FusionSignalWeight => ({
  signal,
  baseline: signalSeverityWeight(signal),
  urgency: statePressure(wave.state),
  stability: Math.max(0, Math.min(1, Number(signal.payload?.stability ?? 0.5))),
  confidence: Math.max(0, Math.min(1, signal.confidence)),
});

const scoreSignal = (metric: FusionSignalWeight): number =>
  (metric.baseline * 0.34) +
  (metric.urgency * 0.24) +
  (metric.stability * 0.2) +
  (ownerWeight(metric.signal) * 0.15) +
  (metric.confidence * 0.07);

const bandFromScore = (score: number): FusionPriorityBand => {
  if (score >= 0.86) return 'critical';
  if (score >= 0.68) return 'high';
  if (score >= 0.48) return 'normal';
  if (score >= 0.3) return 'low';
  return 'noise';
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const stableSortByScore = <T>(items: readonly T[], selector: (item: T) => number): T[] =>
  [...items].sort((a, b) => {
    const scoreA = selector(a);
    const scoreB = selector(b);
    if (scoreA < scoreB) return 1;
    if (scoreA > scoreB) return -1;
    return 0;
  });

export const buildWavePriority = (
  wave: FusionWave,
  context: PriorityContext,
): WavePriorityMatrix => {
  const weights = wave.readinessSignals.map((signal) => normalizeSignal(signal, wave)).map((entry) => ({
    ...entry,
    score: clamp01(scoreSignal(entry)),
  }));

  const validSignals = weights.filter((entry) => entry.signal.payload?.confidence === undefined
    ? true
    : Number(entry.signal.payload.confidence) >= context.minSignalConfidence);

  const sorted = stableSortByScore(validSignals, (entry) => entry.score);
  const selected = sorted.slice(0, context.maxCommands);
  const score = selected.length
    ? selected.reduce((sum, item) => sum + item.score, 0) / selected.length
    : 0;
  const adjusted = clamp01((score * 0.75) + (statePressure(wave.state) * 0.25));

  const recommendations = selected
    .slice(0, 4)
    .map((entry) => `${entry.signal.id}:${entry.signal.source}`);

  const finalScore = Math.max(context.minWaveScore, adjusted);

  return {
    waveId: wave.id,
    band: bandFromScore(finalScore),
    score: finalScore,
    recommended: recommendations,
    contributors: selected.map((entry) => ({
      signal: entry.signal,
      baseline: entry.baseline,
      urgency: entry.urgency,
      stability: entry.stability,
      confidence: entry.signal.confidence,
    })),
  };
};

export const computePriorityHeatmap = (
  waves: readonly FusionWave[],
  context: PriorityContext,
): readonly WavePriorityMatrix[] =>
  waves.map((wave) => buildWavePriority(wave, context));

export const topPriorityWaves = (
  matrix: readonly WavePriorityMatrix[],
): readonly WavePriorityMatrix[] =>
  [...matrix].sort((left, right) => right.score - left.score);
