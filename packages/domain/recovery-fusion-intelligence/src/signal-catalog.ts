import type { Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { FusionSignal, FusionSignalEnvelope, FusionWaveId } from './types';
import type { RecoveryConstraintBudget } from '@domain/recovery-operations-models';

type FusionSignalBrand = Brand<string, 'FusionSignalEnvelope'>;
type SignalFingerprint = Brand<string, 'FusionSignalFingerprint'>;

export interface SignalCluster {
  readonly id: FusionSignalBrand;
  readonly fingerprint: SignalFingerprint;
  readonly source: string;
  readonly count: number;
  readonly signals: readonly FusionSignal[];
  readonly severity: number;
  readonly confidence: number;
  readonly tags: readonly string[];
}

export interface SignalWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly maxSignals: number;
  readonly budget: RecoveryConstraintBudget;
  readonly clusters: readonly SignalCluster[];
}

export interface SignalTransition {
  readonly from: FusionWaveId;
  readonly to: FusionWaveId;
  readonly score: number;
  readonly rationale: string;
}

const normalizeTag = (tag: string): string => tag.trim().toLowerCase();

const makeFingerprint = (signal: {
  readonly source: string;
  readonly runId: string;
  readonly observedAt: string;
  readonly tags: readonly string[];
}): SignalFingerprint => {
  const normalized = `${signal.source}:${signal.runId}:${signal.observedAt}:${signal.tags.join(',')}`;
  return withBrand(normalized, 'FusionSignalFingerprint');
};

export const extractSignalFingerprint = (signal: FusionSignalEnvelope): SignalFingerprint =>
  makeFingerprint(signal);

const normalizeSignal = (signal: FusionSignalEnvelope): FusionSignal => ({
  ...signal,
  tags: [...new Set(signal.tags.map(normalizeTag))],
  payload: signal.payload ?? {},
  details: signal.details ?? {},
});

export const buildClusters = (signals: readonly FusionSignalEnvelope[]): readonly SignalCluster[] => {
  const buckets = new Map<string, FusionSignal[]>();

  for (const raw of signals) {
    const signal = normalizeSignal(raw);
    const key = signal.source || 'unknown';
    const list = buckets.get(key) ?? [];
    list.push(signal);
    buckets.set(key, list);
  }

  const clusters: SignalCluster[] = [];
  for (const [source, values] of buckets) {
    const normalized = values.map((signal) => normalizeSignal(signal));
    const severity = normalized.length ? normalized.reduce((sum, signal) => sum + signal.severity, 0) / normalized.length : 0;
    const confidence = normalized.length
      ? normalized.reduce((sum, signal) => sum + signal.confidence, 0) / normalized.length
      : 0;
    const tags = [...new Set(normalized.flatMap((signal) => signal.tags))];
    const fingerprint = makeFingerprint(normalized[0] ?? {
      source,
      runId: 'none',
      observedAt: new Date().toISOString(),
      tags: ['fallback'],
    });

    clusters.push({
      id: withBrand(`${source}:${new Date().toISOString()}`, 'FusionSignalEnvelope'),
      fingerprint,
      source,
      count: normalized.length,
      signals: normalized,
      severity,
      confidence,
      tags,
    });
  }

  return clusters.sort((left, right) => right.severity - left.severity);
};

export const splitByWindow = (
  signals: readonly FusionSignalEnvelope[],
  startAt: string,
  endAt: string,
  budget: RecoveryConstraintBudget,
): SignalWindow => {
  const clusters = buildClusters(signals);
  const maxSignals = Math.min(signals.length, budget.maxParallelism * 20);
  void endAt;
  return {
    startAt,
    endAt,
    maxSignals,
    budget,
    clusters,
  };
};

const calculateTransitionScore = (from: FusionSignal, to: FusionSignal): number => {
  const sharedTags = from.tags.filter((tag) => new Set(to.tags).has(tag));
  const tagScore = sharedTags.length / Math.max(1, Math.max(from.tags.length, to.tags.length));
  const urgency = (from.severity + to.severity) / 20;
  return Math.max(0, Math.min(1, tagScore * 0.6 + urgency * 0.4));
};

export const buildSignalTransitions = (signals: readonly FusionSignal[]): readonly SignalTransition[] => {
  const transitions: SignalTransition[] = [];
  for (let index = 0; index < signals.length; index += 1) {
    const current = signals[index];
    const next = signals[index + 1];
    if (!next) {
      continue;
    }

    const score = calculateTransitionScore(current, next);
    transitions.push({
      from: current.id as FusionWaveId,
      to: next.id as FusionWaveId,
      score,
      rationale: score >= 0.5 ? 'related-signal-flow' : 'independent-signal',
    });
  }

  return transitions;
};

export const dedupeSignals = (signals: readonly FusionSignalEnvelope[]): readonly FusionSignalEnvelope[] => {
  const seen = new Set<string>();
  const unique: FusionSignal[] = [];

  for (const raw of signals) {
    const normalized = normalizeSignal(raw);
    const id = extractSignalFingerprint(normalized as FusionSignalEnvelope);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push(normalized);
  }

  return unique;
};

export const summarizeSignals = (signals: readonly FusionSignalEnvelope[]): string[] =>
  buildClusters(signals).map((cluster) =>
    `${cluster.source} count=${cluster.count} severity=${cluster.severity.toFixed(2)} confidence=${cluster.confidence.toFixed(2)}`,
  );
