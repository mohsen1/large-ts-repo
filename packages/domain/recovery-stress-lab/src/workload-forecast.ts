import { WorkloadTopology, RecoverySimulationResult, RecoverySignal, SeverityBand, TenantId } from './models';
import { mapNodeExposure, buildTopologyGraph, buildLayers } from './topology-intelligence';
import { mergeSignals } from './models';

export interface ForecastSlice {
  readonly step: number;
  readonly timestamp: string;
  readonly riskScore: number;
  readonly slaConfidence: number;
}

export interface ForecastWindow {
  readonly tenantId: TenantId;
  readonly startAt: string;
  readonly endAt: string;
  readonly slices: readonly ForecastSlice[];
  readonly maxRisk: number;
  readonly averageRisk: number;
}

export interface ForecastOptions {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly simulation: RecoverySimulationResult;
}

interface RiskCurve {
  readonly base: number;
  readonly trend: number;
  readonly decay: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const trendFromTopology = (topology: WorkloadTopology): number => {
  const exposures = mapNodeExposure(topology);
  if (exposures.length === 0) {
    return 0.4;
  }
  const maxRisk = exposures.reduce((acc, entry) => Math.max(acc, entry.isolationRisk), 0);
  return clamp(maxRisk / 10);
};

const signalSignalBoost = (signals: readonly RecoverySignal[]): number => {
  const merged = mergeSignals(signals, signals);
  if (merged.length === 0) {
    return 0.1;
  }
  const critical = merged.filter((signal) => signal.severity === 'critical').length;
  return clamp(critical / Math.max(1, merged.length));
};

const buildCurve = (input: ForecastOptions): RiskCurve => {
  const mergedTopology = buildTopologyGraph(input.topology);
  const nodeCount = mergedTopology.nodes.length;
  const edgeCount = mergedTopology.edges.length;
  const traversal = buildLayers(input.topology);
  const topologyWeight = clamp((nodeCount + 1) / (edgeCount + 1));
  const signalWeight = signalSignalBoost(input.signals);
  const bandBias = input.band === 'critical' ? 0.8 : input.band === 'high' ? 0.6 : input.band === 'medium' ? 0.4 : 0.2;
  const trend = topologyWeight * 0.65 + signalWeight * 0.35;
  const decay = traversal.length > 0 ? 0.6 : 0.9;
  const base = bandBias + traversal.length / 100;
  return {
    base: clamp(base),
    trend: trend,
    decay: clamp(decay),
  };
};

const forecastSlice = (curve: RiskCurve, cursor: number): number => {
  const raw = curve.base + Math.sin(cursor / 5) * 0.08 + curve.trend * 0.35 - cursor * 0.005 * (curve.decay || 1);
  return Number(clamp(raw).toFixed(4));
};

export const forecastRunbookSla = (input: ForecastOptions): ForecastWindow => {
  const curve = buildCurve(input);
  const durationMinutes = Math.min(120, Math.max(8, input.simulation.ticks.length));
  const startAt = new Date(input.simulation.startedAt).toISOString();
  const slices: ForecastSlice[] = [];
  let maxRisk = 0;
  for (let minute = 0; minute < durationMinutes; minute += 1) {
    const riskScore = forecastSlice(curve, minute);
    const slaConfidence = clamp(1 - riskScore);
    maxRisk = Math.max(maxRisk, riskScore);
    const current = new Date(Date.parse(startAt) + minute * 60_000).toISOString();
    slices.push({
      step: minute,
      timestamp: current,
      riskScore,
      slaConfidence,
    });
  }

  const averageRisk = slices.reduce((acc, slice) => acc + slice.riskScore, 0) / Math.max(1, slices.length);
  return {
    tenantId: input.tenantId,
    startAt,
    endAt: new Date(Date.parse(startAt) + slices.length * 60_000).toISOString(),
    slices,
    maxRisk,
    averageRisk: Number(averageRisk.toFixed(4)),
  };
};

export const shouldRaiseAlert = (window: ForecastWindow, threshold: number): boolean => {
  if (window.slices.length === 0) return false;
  if (window.maxRisk >= threshold) return true;
  if (window.averageRisk >= threshold * 0.75) return true;
  return window.slices.some((slice) => slice.slaConfidence < threshold * 0.25);
};
