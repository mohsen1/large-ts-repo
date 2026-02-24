import { Brand, normalizeLimit } from '@shared/core';
import { clamp as sharedClamp, normalizeNumber, percentile, toPercent } from '@shared/util';

export type DemandForecastId = Brand<string, 'DemandForecastId'>;
export type AllocationWindowId = Brand<string, 'AllocationWindowId'>;
export type ThroughputProfileId = Brand<string, 'ThroughputProfileId'>;

export type FulfillmentStressStrategy = 'baseline' | 'burst' | 'throttle' | 'preposition';

export interface DemandSignal {
  tenantId: string;
  productId: string;
  sku: string;
  baseDemand: number;
  observedDemand: number;
  seasonalFactor: number;
  confidence: number;
  sampleWindowStart: string;
  sampleWindowEnd: string;
  source: 'inventory' | 'sales' | 'partner';
}

export interface ThroughputProfile {
  id: ThroughputProfileId;
  tenantId: string;
  windowMinutes: number;
  throughputTarget: number;
  throughputActual: number;
  capacityUtilization: number;
  peakRatio: number;
  lane: string;
}

export interface ForecastWindow {
  slotStart: string;
  slotEnd: string;
  forecastUnits: number;
  demandVariance: number;
  backlogRisk: number;
  confidence: number;
}

export interface ResourceSchedule {
  zoneId: string;
  activeWorkers: number;
  reservedWorkers: number;
  utilizationPercent: number;
  overtimeHours: number;
  breakRatio: number;
}

export interface CandidateAllocation {
  forecastId: DemandForecastId;
  strategy: FulfillmentStressStrategy;
  signal: DemandSignal;
  forecast: readonly ForecastWindow[];
  schedule: ResourceSchedule;
  marginBuffer: number;
  riskBand: 'low' | 'medium' | 'high' | 'critical';
}

export interface WorkloadScenario {
  id: AllocationWindowId;
  tenantId: string;
  demandProfile: readonly DemandSignal[];
  windows: readonly ForecastWindow[];
  strategy: FulfillmentStressStrategy;
  score: number;
  recommendation: string;
}

export interface SlaTarget {
  metric: 'ttr' | 'on-time';
  thresholdMs: number;
  graceWindowMs: number;
  penaltyPerBreachedRun: number;
}

export interface ForecastPlan {
  planId: Brand<string, 'ForecastPlanId'>;
  tenantId: string;
  windows: readonly ForecastWindow[];
  scenario: WorkloadScenario;
  riskBudget: number;
  selectedStrategies: readonly FulfillmentStressStrategy[];
  slaTargets: readonly SlaTarget[];
  generatedAt: string;
}

export interface AnalyticsEnvelope {
  tenantId: string;
  planId: ForecastPlan['planId'];
  score: number;
  riskBand: WorkloadScenario['recommendation'];
  bottlenecks: readonly string[];
}

export const normalize = (value: number, min: number, max: number): number =>
  sharedClamp(normalizeNumber(value), min, max);

export const asDemandForecastId = (value: string): DemandForecastId => value as DemandForecastId;

export const asAllocationWindowId = (value: string): AllocationWindowId => value as AllocationWindowId;

export const asThroughputProfileId = (value: string): ThroughputProfileId => value as ThroughputProfileId;

export const normalizedDemandRatio = (signal: DemandSignal): number => {
  const raw = signal.observedDemand / Math.max(1, signal.baseDemand);
  return clamp(raw);
};

export const demandConfidenceBand = (signal: DemandSignal): 'high' | 'medium' | 'low' => {
  if (signal.confidence >= 0.85) return 'high';
  if (signal.confidence >= 0.6) return 'medium';
  return 'low';
};

export const scheduleSaturationScore = (schedule: ResourceSchedule): number => {
  const utilizationRatio = clamp(schedule.utilizationPercent / 100);
  const overtimePenalty = clamp(schedule.overtimeHours, 0, 16);
  const reservePenalty = clamp(schedule.reservedWorkers / Math.max(1, schedule.activeWorkers), 0, 1);
  const breakPenalty = clamp(schedule.breakRatio, 0, 1);
  return normalize(100 * (utilizationRatio * 0.7 + overtimePenalty * 0.2 + reservePenalty * 0.1) * (1 - breakPenalty), 0, 100);
};

export const aggregateWindowRisk = (windows: readonly ForecastWindow[]): number => {
  if (windows.length === 0) return 0;
  const risks = windows.map((window) => clamp(window.backlogRisk * 100, 0, 1_000));
  const average = risks.reduce((acc, value) => acc + value, 0) / risks.length;
  const p95 = percentile(risks, 0.95);
  return normalize(average * 0.6 + p95 * 0.4, 0, 1000);
};

export const scoreAllocation = (allocation: CandidateAllocation): number => {
  const demandRatio = normalizedDemandRatio(allocation.signal);
  const profileQuality = toPercent(1 - clamp(allocation.marginBuffer, 0, 1), 1);
  const utilization = clamp(allocation.schedule.utilizationPercent, 0, 150);
  const confidence = normalize(allocation.signal.confidence * 100, 0, 100);
  const riskPenalty = Math.max(0, 30 - clamp(allocation.signal.baseDemand, 0, 30));
  const strategyFactor = allocation.strategy === 'burst' ? 1.3 : allocation.strategy === 'throttle' ? 0.7 : 1;

  const score = (demandRatio * 35 + utilization * 0.2 + confidence + profileQuality * 0.5 + demandRatio * 5) * strategyFactor - riskPenalty;
  return Math.max(0, Number(score.toFixed(2)));
};

export const estimateLimits = (demandSignals: readonly DemandSignal[]): { limit: number; used: number; spare: number } => {
  const demandTotal = demandSignals.reduce((acc, signal) => acc + signal.observedDemand, 0);
  const limit = normalizeLimit(Math.ceil(demandTotal * 1.35));
  const used = Math.min(demandTotal, limit);
  return { limit, used, spare: Math.max(0, limit - demandTotal) };
};

export const clamp = (value: number, min = 0, max = 100): number => sharedClamp(normalizeNumber(value), min, max);

export const clamp01 = (value: number): number => clamp(value, 0, 1);
