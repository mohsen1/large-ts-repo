import { z } from 'zod';
import { type Brand, withBrand } from '@shared/core';
import type { RecoverySignal } from './types';

export const recoverySignalSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  severity: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  detectedAt: z.string().datetime(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export type SignalBundleId = Brand<string, 'SignalBundleId'>;

export interface SignalEnvelope {
  readonly bundleId: SignalBundleId;
  readonly tenant: string;
  readonly signal: RecoverySignal;
  readonly routeKey: string;
  readonly receivedAt: string;
}

export interface SignalCluster {
  readonly clusterId: string;
  readonly tenant: string;
  readonly source: string;
  readonly signatures: readonly RecoverySignal[];
  readonly score: number;
}

interface ClusterAccumulator {
  source: string;
  tenant: string;
  signatures: RecoverySignal[];
  score: number;
}

export interface RankedSignalPortfolios {
  readonly tenant: string;
  readonly clusters: readonly SignalCluster[];
  readonly topSource: string;
  readonly averageSeverity: number;
  readonly averageConfidence: number;
}

const normalizeTenant = (tenant: string): string => tenant.trim().toLowerCase();
const safeNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const weightedScore = (signals: readonly RecoverySignal[]): number => {
  const severity = signals.reduce((acc, signal) => acc + safeNumber(signal.severity), 0);
  const confidence = signals.reduce((acc, signal) => acc + safeNumber(signal.confidence), 0);
  const count = signals.length || 1;
  const recencyPenalty = signals
    .map((signal) => Date.now() - new Date(signal.detectedAt).getTime())
    .reduce((acc, ageMs) => acc + Math.max(0, 1 - ageMs / (24 * 60 * 60_000)), 0);

  const normalizedRecency = signals.length
    ? Number((recencyPenalty / signals.length).toFixed(4))
    : 0;

  return Number((((severity / count) * 0.7 + (confidence / count) * 2.5) * (1 + normalizedRecency)).toFixed(4));
};

export const parseSignal = (input: unknown): RecoverySignal => {
  return recoverySignalSchema.parse(input) as RecoverySignal;
};

export const buildSignalEnvelope = (tenant: string, routeKey: string, rawSignal: unknown): SignalEnvelope => {
  const signal = parseSignal(rawSignal);
  return {
    bundleId: withBrand(`${normalizeTenant(tenant)}:${routeKey}:${signal.id}`, 'SignalBundleId'),
    tenant: normalizeTenant(tenant),
    signal,
    routeKey,
    receivedAt: new Date().toISOString(),
  };
}

const addSignalToAccumulator = (acc: Map<string, ClusterAccumulator>, signal: RecoverySignal): void => {
  const key = `${signal.source}:${signal.id}`;
  const previous = acc.get(key);

  if (!previous) {
    acc.set(key, {
      source: signal.source,
      tenant: normalizeTenant(signal.source),
      signatures: [signal],
      score: weightedScore([signal]),
    });
    return;
  }

  previous.signatures.push(signal);
  previous.score = weightedScore(previous.signatures);
};

export const clusterSignals = (tenant: string, signals: readonly RecoverySignal[]): readonly SignalCluster[] => {
  const grouped = new Map<string, ClusterAccumulator>();

  for (const signal of signals) {
    addSignalToAccumulator(grouped, signal);
  }

  return Array.from(grouped.entries())
    .map(([key, entry]) => ({
      clusterId: `${normalizeTenant(tenant)}:${key}`,
      tenant: normalizeTenant(tenant),
      source: entry.source,
      signatures: entry.signatures,
      score: Number(entry.score.toFixed(4)),
    }))
    .sort((first, second) => second.score - first.score);
}

export const buildSignalPortfolio = (tenant: string, signals: readonly RecoverySignal[]): RankedSignalPortfolios => {
  const normalizedTenant = normalizeTenant(tenant);
  const clusters = clusterSignals(normalizedTenant, signals);

  const averageSeverity = Number(
    (
      clusters.reduce((acc, cluster) => {
        const severity = cluster.signatures.reduce((seed, signal) => seed + safeNumber(signal.severity), 0);
        const total = cluster.signatures.length || 1;
        return acc + severity / total;
      }, 0) / (clusters.length || 1)
    ).toFixed(4),
  );

  const averageConfidence = Number(
    (
      clusters.reduce((acc, cluster) => {
        const confidence = cluster.signatures.reduce((seed, signal) => seed + safeNumber(signal.confidence), 0);
        const total = cluster.signatures.length || 1;
        return acc + confidence / total;
      }, 0) / (clusters.length || 1)
    ).toFixed(4),
  );

  return {
    tenant: normalizedTenant,
    clusters,
    topSource: clusters[0]?.source ?? 'none',
    averageSeverity,
    averageConfidence: Number(Math.max(0, Math.min(1, averageConfidence)).toFixed(4)),
  };
}

export const sortSignalPortfolios = (portfolios: readonly RankedSignalPortfolios[]): readonly RankedSignalPortfolios[] => {
  return [...portfolios].sort((left, right) => {
    if (right.averageSeverity !== left.averageSeverity) {
      return right.averageSeverity - left.averageSeverity;
    }

    return right.averageConfidence - left.averageConfidence;
  });
};

export const uniqueSignalsBySource = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  const map = new Map<string, RecoverySignal>();
  for (const signal of signals) {
    if (!map.has(signal.id)) {
      map.set(signal.id, signal);
    }
  }
  return Array.from(map.values());
};
