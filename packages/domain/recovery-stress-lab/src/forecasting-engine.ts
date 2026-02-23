import { buildFunnel, FunnelStep } from '@domain/analytics';
import { normalizeLimit } from '@shared/core';
import {
  TenantId,
  RecoverySignal,
  SeverityBand,
  WorkloadTopology,
  WorkloadTopologyNode,
} from './models';
import { inferRiskBandFromSignals, mapNodeExposure } from './topology-intelligence';
import { simulateBandCoverage, summarizeSignals } from './stress-analytics';

export interface StressForecastWindow {
  readonly windowStartMinute: number;
  readonly windowEndMinute: number;
  readonly severityLoad: number;
  readonly signalCount: number;
  readonly impactedNodes: readonly string[];
}

export interface ForecastInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly windowMinutes?: number;
}

export interface ForecastOutput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly bucketCount: number;
  readonly windows: readonly StressForecastWindow[];
  readonly peakLoad: number;
  readonly trend: 'rising' | 'stable' | 'declining';
  readonly confidence: number;
  readonly signalDigest: ReturnType<typeof summarizeSignals>;
}

type SeverityWeight = Readonly<Record<SeverityBand, number>>;

const BAND_WEIGHT: SeverityWeight = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const clampWindow = (minute: number): number => {
  if (!Number.isFinite(minute)) return 0;
  const normalized = Math.floor(minute % (24 * 60));
  return normalized < 0 ? normalized + 24 * 60 : normalized;
};

const buildWindowKey = (minute: number): string => String(clampWindow(minute));

const signalSignalWeight = (signal: RecoverySignal): number => BAND_WEIGHT[signal.severity];

const normalizeNodeImpact = (nodes: readonly WorkloadTopologyNode[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const node of nodes) {
    map.set(String(node.id), Number(node.criticality ?? 1));
  }
  return map;
};

const buildWindows = (
  signals: readonly RecoverySignal[],
  bucketMinutes: number,
): ReadonlyArray<{
  key: string;
  minute: number;
  signals: RecoverySignal[];
}> => {
  const buckets = new Map<string, RecoverySignal[]>();
  const normalizedBucket = Math.max(1, Math.floor(bucketMinutes));

  for (const signal of signals) {
    const createdAt = new Date(signal.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;

    const bucketMinute = clampWindow(Math.floor(createdAt.getUTCMinutes() / normalizedBucket) * normalizedBucket);
    const key = buildWindowKey(bucketMinute);
    const list = buckets.get(key) ?? [];
    buckets.set(key, [...list, signal]);
  }

  return [...buckets.entries()]
    .map(([key, signalBucket]) => ({ key, minute: Number(key), signals: signalBucket }))
    .sort((left, right) => left.minute - right.minute);
};

const pickImpactedNodes = (
  topology: WorkloadTopology,
  signals: readonly RecoverySignal[],
): readonly string[] => {
  const exposures = mapNodeExposure(topology);
  if (signals.length === 0) return [];
  const impacted = new Set<string>();

  const byScore = new Map<string, number>();
  for (const signal of signals) {
    const base = signalSignalWeight(signal);
    for (const entry of exposures) {
      const riskBoost = signal.class === 'availability' ? 1.2 : signal.class === 'performance' ? 0.8 : 1;
      const current = byScore.get(entry.nodeId) ?? 0;
      byScore.set(entry.nodeId, current + base * riskBoost * (entry.isolationRisk + 1));
    }
  }

  for (const [nodeId, score] of byScore.entries()) {
    if (score >= 2) {
      impacted.add(nodeId);
    }
  }

  return [...impacted];
};

export const buildStressForecast = (input: ForecastInput): ForecastOutput => {
  const normalizedBand = inferRiskBandFromSignals(input.signals);
  const windowMinutes = Math.max(10, Math.floor(normalizeLimit(input.windowMinutes ?? 30)));
  const windows = buildWindows(input.signals, windowMinutes);
  const normalizedTopology = input.topology;
  const impactMap = normalizeNodeImpact(normalizedTopology.nodes);
  const outputWindows: StressForecastWindow[] = [];
  const bucketSignalLoad: number[] = [];

  for (const bucket of windows) {
    const load = bucket.signals.reduce((sum, signal) => sum + signalSignalWeight(signal), 0);
    const impactedNodes = pickImpactedNodes(input.topology, bucket.signals)
      .filter((nodeId) => impactMap.has(nodeId))
      .slice(0, 8);

    const severityLoad = Math.min(40, load);
    outputWindows.push({
      windowStartMinute: clampWindow(bucket.minute),
      windowEndMinute: clampWindow(bucket.minute + windowMinutes),
      severityLoad,
      signalCount: bucket.signals.length,
      impactedNodes,
    });
    bucketSignalLoad.push(severityLoad);
  }

    const normalizedSignalDigest = summarizeSignals(input.tenantId, input.signals);
  const coverage = simulateBandCoverage([], input.signals.length > 0 ? normalizedBand : input.band);

  if (outputWindows.length < 3) {
    for (let index = outputWindows.length; index < 3; index += 1) {
      const minute = clampWindow(index * windowMinutes);
      outputWindows.push({
        windowStartMinute: minute,
        windowEndMinute: clampWindow(minute + windowMinutes),
        severityLoad: 0,
        signalCount: 0,
        impactedNodes: [],
      });
      bucketSignalLoad.push(0);
    }
  }

  const sortedLoads = [...bucketSignalLoad].sort((left, right) => left - right);
  const peakLoad = sortedLoads[sortedLoads.length - 1] ?? 0;
  const trend =
    sortedLoads.length < 3
      ? 'stable'
      : sortedLoads[sortedLoads.length - 1] > sortedLoads[0] * 1.6
        ? 'rising'
        : sortedLoads[sortedLoads.length - 1] < sortedLoads[0] * 0.75
          ? 'declining'
          : 'stable';

  const funnelInput: ReadonlyArray<FunnelStep> = outputWindows.map((window) => ({
    name: `${window.windowStartMinute}-${window.windowEndMinute}`,
    value: window.signalCount,
  }));
  const funnel = funnelInput.length > 1 ? buildFunnel(funnelInput) : null;
  const funnelDrop = funnel ? funnel.hitRate : 0;

  return {
    tenantId: input.tenantId,
    band: normalizedBand,
    bucketCount: outputWindows.length,
    windows: outputWindows,
    peakLoad,
    trend,
    confidence: Math.min(1, 1 - Math.abs((coverage.utilization - funnelDrop) / Math.max(1, windowMinutes))),
    signalDigest: normalizedSignalDigest,
  };
};

export interface ForecastAudit {
  readonly tenantId: TenantId;
  readonly confidence: number;
  readonly topSignals: ReadonlyArray<string>;
  readonly impactedNodeCount: number;
}

export const auditForecast = (forecast: ForecastOutput): ForecastAudit => {
  const topSignals = forecast.signalDigest.topSeverity === 'critical'
    ? ['critical-only', 'high-priority']
    : forecast.signalDigest.topSeverity === 'high'
      ? ['high-priority', 'standard']
      : ['standard', 'observed'];
  const signalBucket = forecast.windows.reduce((count, window) => count + window.signalCount, 0);
  const impactedNodeCount = new Set(forecast.windows.flatMap((entry) => entry.impactedNodes)).size;
  return {
    tenantId: forecast.tenantId,
    confidence: forecast.confidence * (signalBucket > 0 ? 1 : 0.5),
    topSignals,
    impactedNodeCount,
  };
};
