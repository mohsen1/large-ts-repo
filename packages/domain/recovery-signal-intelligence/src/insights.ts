import type {
  SignalDimension,
  SignalEnvelope,
  SignalFeedSnapshot,
  SignalIntensity,
  SignalPriority,
  SignalPulse
} from './models';

import { driftRatio } from './routing';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const riskVector = (drift: number, confidence: number): 'low' | 'medium' | 'high' | 'critical' => {
  const severity = Math.abs(drift) * confidence;
  if (severity >= 0.8) {
    return 'critical';
  }
  if (severity >= 0.55) {
    return 'high';
  }
  if (severity >= 0.3) {
    return 'medium';
  }
  return 'low';
};

export const summarizeIntensity = (pulse: SignalPulse): SignalIntensity => {
  const delta = driftRatio(pulse);
  const confidence = clamp01(pulse.value === 0 ? 0.5 : Math.min(1, Math.abs(pulse.value / 100)));
  const baselineDelta = Number(((pulse.value - pulse.baseline) / Math.max(1, Math.abs(pulse.baseline))).toFixed(4));

  return {
    dimension: pulse.dimension,
    intensity: Math.abs(delta),
    drift: delta,
    confidence,
    baselineDelta,
    riskVector: riskVector(delta, confidence),
  };
};

export const buildPriorities = (
  snapshot: SignalFeedSnapshot
): SignalPriority[] => {
  const sorted = [...snapshot.pulses].sort((left, right) => {
    const leftIntensity = summarizeIntensity(left).intensity;
    const rightIntensity = summarizeIntensity(right).intensity;
    return rightIntensity - leftIntensity;
  });

  return sorted.slice(0, 8).map((pulse, index) => {
    const intensity = summarizeIntensity(pulse);
    const recoveryMinutes = Math.ceil(
      (1 - intensity.confidence) * 180 + (Math.abs(intensity.baselineDelta) * 60)
    );

    const why = [
      `${pulse.dimension} drift ${intensity.drift.toFixed(3)}`,
      `baseline delta ${intensity.baselineDelta.toFixed(3)}`,
      `source ${pulse.source}`,
      `weight ${pulse.weight.toFixed(2)}`,
    ];

    return {
      pulseId: pulse.id,
      rank: index + 1,
      urgency: intensity.riskVector,
      why,
      projectedRecoveryMinutes: recoveryMinutes,
    };
  });
};

export const envelopeConfidence = (envelopes: SignalEnvelope[]): Record<string, number> => {
  const summary = Object.fromEntries(
    envelopes.map((envelope) => {
      if (envelope.samples.length === 0) {
        return [envelope.pulseId, 0];
      }

      const total = envelope.samples.reduce((acc, point) => acc + point.confidence, 0);
      return [envelope.pulseId, Number((total / envelope.samples.length).toFixed(4))];
    })
  );

  return summary as Record<string, number>;
};

export const aggregateByDimension = (pulses: SignalPulse[]): Record<SignalDimension, SignalIntensity> => {
  const grouped = pulses.reduce((acc, pulse) => {
    const current = acc[pulse.dimension];
    if (!current) {
      acc[pulse.dimension] = summarizeIntensity(pulse);
    } else {
      acc[pulse.dimension] = {
        ...current,
        intensity: Number(((current.intensity + summarizeIntensity(pulse).intensity) / 2).toFixed(4)),
        drift: (current.drift + summarizeIntensity(pulse).drift) / 2,
        confidence: Number(((current.confidence + summarizeIntensity(pulse).confidence) / 2).toFixed(4)),
        baselineDelta: (current.baselineDelta + summarizeIntensity(pulse).baselineDelta) / 2,
        riskVector: riskVector(
          (current.drift + summarizeIntensity(pulse).drift) / 2,
          (current.confidence + summarizeIntensity(pulse).confidence) / 2
        ),
      };
    }
    return acc;
  }, {} as Record<SignalDimension, SignalIntensity>);

  return grouped;
};

export const detectCoverageGaps = (snapshot: SignalFeedSnapshot): string[] => {
  const activeDimensions = Object.keys(snapshot.intensityByDimension);
  const requiredDimensions: SignalDimension[] = [
    'capacity',
    'latency',
    'availability',
    'reachability',
    'integrity',
    'cost',
    'compliance',
  ];

  return requiredDimensions
    .filter((dimension) => !activeDimensions.includes(dimension))
    .map((dimension) => `Missing dimension coverage: ${dimension}`);
};
