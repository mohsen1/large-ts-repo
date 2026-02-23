import { groupBy } from '@shared/util';
import type { RecoverySignal } from '../types';

export interface ReplaySample {
  readonly at: string;
  readonly value: number;
  readonly metric: string;
}

export interface ReplayBundle {
  readonly scenarioId: string;
  readonly metric: string;
  readonly samples: readonly ReplaySample[];
  readonly cadenceMinutes: number;
  readonly count: number;
}

export interface ReplayInput {
  readonly scenarioId: string;
  readonly metrics: readonly string[];
  readonly seed: number;
  readonly cadenceMinutes: number;
}

interface RandomState {
  value: number;
}

const buildSeed = (seed: number): RandomState => ({ value: seed || 1 });

const nextFloat = (state: RandomState): number => {
  state.value = (state.value * 1103515245 + 12345) & 0x7fffffff;
  return state.value / 0x7fffffff;
};

const nextSignalValue = (metric: string, random: number): number => {
  const base = metric.length * 7;
  const jitter = (random - 0.5) * 30;
  return Math.max(0, base + jitter);
};

export const replaySignals = (input: ReplayInput): readonly ReplaySample[] => {
  const state = buildSeed(input.seed);
  const metrics = input.metrics.length === 0 ? ['latency_p99', 'error_rate', 'queue_depth'] : input.metrics;
  const samples: ReplaySample[] = [];
  const count = 120;
  const now = Date.now();

  for (let step = 0; step < count; step += 1) {
    const at = new Date(now + step * input.cadenceMinutes * 60_000).toISOString();
    for (const metric of metrics) {
      const raw = nextFloat(state);
      samples.push({
        at,
        metric,
        value: nextSignalValue(metric, raw),
      });
    }
  }

  return samples;
};

export const adaptReplayToSignals = (scenarioId: string, replay: readonly ReplaySample[]): readonly RecoverySignal[] => {
  return replay.map((sample, index) => {
    const dimensions = {
      metric: sample.metric,
      replay: 'true',
    };
    return {
      id: `${scenarioId}:${sample.metric}:${index}` as RecoverySignal['id'],
      tenantId: `${scenarioId}:tenant` as RecoverySignal['tenantId'],
      incidentId: `${scenarioId}:incident` as RecoverySignal['incidentId'],
      metric: sample.metric,
      value: sample.value,
      unit: 'index',
      observedAt: sample.at,
      dimensions,
    };
  });
};

export const summarizeReplay = (scenarioId: string, samples: readonly ReplaySample[]): readonly ReplayBundle[] => {
  const byMetric = groupBy(samples, (sample) => sample.metric);
  const bundles: ReplayBundle[] = [];

  for (const item of byMetric) {
    const metricSamples = item.values;
    const cadence = metricSamples.length > 1
      ? (new Date(metricSamples[1]!.at).getTime() - new Date(metricSamples[0]!.at).getTime()) / 60_000
      : 0;

    const count = metricSamples.length;
    bundles.push({
      scenarioId,
      metric: item.key,
      samples: metricSamples,
      cadenceMinutes: cadence,
      count,
    });
  }

  return bundles;
};
