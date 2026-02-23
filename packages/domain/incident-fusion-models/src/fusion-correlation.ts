import type {
  RecoverySignal,
  RecoveryScenario,
  SignalId,
  ScenarioId,
  PriorityBand,
  SignalEnvelope,
  SignalPulse,
} from './incident-fusion-core';
import { withBrand } from '@shared/core';

export interface CorrelatedSignalGroup {
  readonly scenarioId: ScenarioId;
  readonly signals: readonly RecoverySignal[];
  readonly overlapScore: number;
  readonly dominantSource: string;
}

export interface CrossSignalMatrix {
  readonly rows: readonly SignalId[];
  readonly columns: readonly SignalId[];
  readonly scores: readonly number[];
}

export interface CorrelationPlan {
  readonly scenario: RecoveryScenario;
  readonly groups: readonly CorrelatedSignalGroup[];
  readonly matrix: CrossSignalMatrix;
}

export interface ScenarioSignalDelta {
  readonly signalId: SignalId;
  readonly scoreDelta: number;
  readonly addedSeverity: number;
}

export interface CorrelationSummary {
  readonly scenarioId: ScenarioId;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly sourceEntropy: number;
  readonly meanPriority: number;
}

const normalize = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(4))));

export const buildCrossSignalMatrix = (signals: readonly RecoverySignal[]): CrossSignalMatrix => {
  const ids = signals.map((signal) => signal.id);
  const rows = [...ids];
  const columns = [...ids];
  const scores: number[] = [];

  for (let i = 0; i < signals.length; i += 1) {
    for (let j = 0; j < signals.length; j += 1) {
      const current = signals[i];
      const other = signals[j];
      const overlap = intersectTags(current.tags, other.tags).length;
      const evidenceDelta = Math.min(current.evidence.length, other.evidence.length);
      const timeDelta = 1 - Math.min(1, Math.abs(Date.parse(current.updatedAt) - Date.parse(other.updatedAt)) / 86_400_000);
      const baseScore = (overlap / Math.max(1, current.tags.length + other.tags.length - overlap)) * 0.5;
      const evidenceScore = Math.min(1, (evidenceDelta + 1) / (Math.max(1, current.evidence.length, other.evidence.length) + 1));
      const score = normalize(baseScore * 0.5 + evidenceScore * 0.3 + timeDelta * 0.2);
      scores.push(score);
    }
  }

  return { rows, columns, scores };
};

export const groupSignals = (signals: readonly RecoverySignal[]): readonly CorrelatedSignalGroup[] => {
  const bySource = new Map<string, RecoverySignal[]>();

  for (const signal of signals) {
    const bucket = bySource.get(signal.region);
    if (!bucket) {
      bySource.set(signal.region, [signal]);
    } else {
      bucket.push(signal);
    }
  }

  return Array.from(bySource.entries()).map(([region, grouped]) => {
    const matrix = buildCrossSignalMatrix(grouped);
    const overlap = grouped.length === 0 ? 0 : matrix.scores.reduce((sum, score) => sum + score, 0) / matrix.scores.length;
    const scenarioId = withBrand(`scenario-${grouped[0]?.id ?? 'root'}`, 'ScenarioId');
    return {
      scenarioId,
      signals: grouped,
      overlapScore: normalize(overlap),
      dominantSource: region,
    };
  });
};

export const summarizeScenarioSignals = (signals: readonly RecoverySignal[]): CorrelationSummary => {
  const scenarioId = signals[0] ? withBrand(signals[0].id, 'ScenarioId') : withBrand('scenario-default', 'ScenarioId');
  const counts = countSignalsByPriority(signals);
  const sourceEntropyScore = sourceEntropy(signals);
  const meanPriority = mapPriorityToNumber(signals);
  return {
    scenarioId,
    criticalCount: counts.critical,
    highCount: counts.high,
    sourceEntropy: sourceEntropyScore,
    meanPriority,
  };
};

export const correlateSignalsToScenario = (
  scenario: RecoveryScenario,
  signals: readonly RecoverySignal[],
): CorrelationPlan => {
  const scopedSignals = signals.filter((signal) => signal.tenant === scenario.tenant);
  const groups = groupSignals(scopedSignals);
  return {
    scenario,
    groups,
    matrix: buildCrossSignalMatrix(scopedSignals),
  };
};

export const buildSignalDeltas = (
  current: readonly SignalEnvelope<RecoverySignal>[],
  previous: readonly SignalEnvelope<RecoverySignal>[],
): readonly ScenarioSignalDelta[] => {
  const previousMap = new Map<string, SignalEnvelope<RecoverySignal>>();
  for (const entry of previous) {
    previousMap.set(entry.data.id, entry);
  }

  return current
    .map((item) => {
      const old = previousMap.get(item.data.id);
      const scoreCurrent = computeSignalPulse(item).value;
      const scorePrevious = old ? computeSignalPulse(old).value : 0;
      return {
        signalId: item.data.id,
        scoreDelta: normalize(scoreCurrent - scorePrevious),
        addedSeverity: Math.max(0, item.data.severity - (old?.data.severity ?? 0)),
      };
    })
    .toSorted((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta));
};

export const topCorrelatedSignals = (matrix: CrossSignalMatrix, size = 5): Array<[SignalId, SignalId, number]> => {
  const triples: Array<[SignalId, SignalId, number]> = [];
  for (let row = 0; row < matrix.rows.length; row += 1) {
    for (let col = 0; col < matrix.columns.length; col += 1) {
      if (row === col) continue;
      const maybe = matrix.scores[row * matrix.columns.length + col];
      if (typeof maybe === 'number') {
        triples.push([matrix.rows[row], matrix.columns[col], maybe]);
      }
    }
  }
  return triples.toSorted((left, right) => right[2] - left[2]).slice(0, size);
};

export const prioritizeGroups = (groups: readonly CorrelatedSignalGroup[]): readonly CorrelatedSignalGroup[] =>
  [...groups].toSorted((left, right) => right.overlapScore - left.overlapScore);

export const countSignalsByPriority = (signals: readonly RecoverySignal[]): Record<PriorityBand, number> =>
  signals.reduce<Record<PriorityBand, number>>(
    (acc, signal) => {
      const next = { ...acc };
      next[signal.priority] += 1;
      return next;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );

export const correlationHeat = (scores: readonly number[]): number => {
  if (scores.length === 0) return 0;
  const ordered = [...scores].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)] ?? 0;
  const variance = ordered.reduce((sum, score) => sum + Math.pow(score - median, 2), 0) / ordered.length;
  return normalize(Math.sqrt(variance));
};

export const classifyCorrelationRisk = (plan: CorrelationPlan): 'low' | 'medium' | 'high' | 'critical' => {
  const heat = correlationHeat(plan.matrix.scores);
  const density = plan.matrix.scores.length === 0 ? 0 : plan.matrix.scores.reduce((sum, score) => sum + score, 0) / plan.matrix.scores.length;
  const ids = [...plan.scenario.signalIds];
  const severity = ids.length > 0 ? Math.min(1, ids.length / 10) : 0;
  if (severity > 0.6 && heat > 0.7 && density > 0.6) return 'critical';
  if (severity > 0.45 || heat > 0.6) return 'high';
  if (severity > 0.2 || density > 0.45) return 'medium';
  return 'low';
};

function intersectTags(left: readonly string[], right: readonly string[]): readonly string[] {
  const set = new Set(left);
  return right.filter((item) => set.has(item));
}

function computeSignalPulse(envelope: SignalEnvelope<RecoverySignal>): SignalPulse {
  return {
    value: envelope.data.severity,
    signalId: envelope.data.id,
    at: envelope.recordedAt,
  };
}

function mapPriorityToNumber(signals: readonly RecoverySignal[]): number {
  if (signals.length === 0) return 0;
  const counts = countSignalsByPriority(signals);
  const value = counts.critical * 4 + counts.high * 3 + counts.medium * 2 + counts.low;
  return normalize(value / Math.max(1, signals.length * 4));
}

function sourceEntropy(signals: readonly RecoverySignal[]): number {
  const freq = new Map<string, number>();
  for (const signal of signals) {
    const current = freq.get(signal.region) ?? 0;
    freq.set(signal.region, current + 1);
  }
  const total = signals.length;
  if (total === 0) return 0;
  const ent = Array.from(freq.values()).reduce((sum, count) => {
    const p = count / total;
    return sum - p * Math.log2(p);
  }, 0);
  const max = Math.log2(Math.max(1, freq.size));
  return max === 0 ? 0 : normalize(ent / max);
}
