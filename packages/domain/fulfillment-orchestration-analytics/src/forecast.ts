import { addMinutes, buildTimeWindows, toRfc3339 } from '@shared/util';
import {
  aggregateWindowRisk,
  normalize,
  ForecastWindow,
  DemandSignal,
  DemandForecastId,
  asDemandForecastId,
  WorkloadScenario,
  ForecastPlan,
  FulfillmentStressStrategy,
  SlaTarget,
  asAllocationWindowId,
  estimateLimits,
  scoreAllocation,
  scheduleSaturationScore,
  clamp01,
} from './models';

export interface ForecastIntent {
  tenantId: string;
  horizonMinutes: number;
  strategy: FulfillmentStressStrategy;
  minimumCoverage: number;
  sla: readonly SlaTarget[];
}

export interface ForecastRequest {
  tenantId: string;
  productId: string;
  signals: readonly DemandSignal[];
  intent: ForecastIntent;
}

export type AggregateState = 'cold' | 'warming' | 'hot';

export interface ForecastDiagnostics {
  requestId: string;
  signalCount: number;
  windowCount: number;
  aggregateState: AggregateState;
  topSku: string;
  riskBand: 'low' | 'medium' | 'high' | 'critical';
}

export interface DemandEnvelope {
  tenantId: string;
  forecastId: DemandForecastId;
  windows: readonly ForecastWindow[];
  createdAt: string;
  diagnostics: ForecastDiagnostics;
}

const clampUnit01 = (value: number): number => Math.max(0, Math.min(1, value));

const sampleWindow = (start: string, minutes: number, baseline: number): ForecastWindow => {
  const from = new Date(start);
  const to = addMinutes(from, minutes);
  const demandUnits = normalize(baseline * 0.85 + Math.max(0, Math.sin(minutes / 12) * baseline * 0.15), 0, 20_000);
  const confidence = normalize(0.5 + Math.sin(minutes / 9) * 0.25, 0.2, 0.98);
  const variance = normalize((minutes % 9) / 20 + 0.05, 0.01, 1.0);
  const risk = clampUnit01((1 - confidence) * 0.7 + variance * 0.3);

  return {
    slotStart: toRfc3339(from),
    slotEnd: toRfc3339(to),
    forecastUnits: demandUnits,
    demandVariance: Number(variance.toFixed(4)),
    backlogRisk: risk,
    confidence,
  };
};

export const deriveState = (signals: readonly DemandSignal[]): AggregateState => {
  const observed = signals.reduce((acc, signal) => acc + signal.observedDemand, 0);
  const baseline = signals.reduce((acc, signal) => acc + signal.baseDemand, 0);
  const ratio = observed / Math.max(1, baseline);
  if (ratio < 0.7) return 'cold';
  if (ratio < 1.15) return 'warming';
  return 'hot';
};

export const buildForecast = (request: ForecastRequest): DemandEnvelope => {
  const anchor = new Date();
  const windows = buildTimeWindows(anchor, request.intent.horizonMinutes, 15);
  const forecastId = asDemandForecastId(`forecast-${request.tenantId}-${Date.now()}`);
  const baselineSignals: readonly DemandSignal[] = request.signals.length
    ? request.signals
    : [{
      tenantId: request.tenantId,
      productId: request.productId,
      sku: 'bootstrap',
      baseDemand: 1,
      observedDemand: 1,
      seasonalFactor: 1,
      confidence: 0.5,
      sampleWindowStart: new Date().toISOString(),
      sampleWindowEnd: new Date(Date.now() + 60_000).toISOString(),
      source: 'sales',
    }];

  const forecastWindows = windows.map((window, index) => {
    const signalWeight = baselineSignals[index % baselineSignals.length]?.baseDemand ?? 0;
    return sampleWindow(toRfc3339(window.start), 15, Math.max(1, signalWeight));
  });

  const state = deriveState(baselineSignals);
  const riskBand = forecastWindows.some((window) => window.backlogRisk > 0.7)
    ? 'critical'
    : forecastWindows.some((window) => window.backlogRisk > 0.4)
      ? 'high'
      : forecastWindows.some((window) => window.backlogRisk > 0.2)
        ? 'medium'
        : 'low';
  const topSignal = baselineSignals.reduce((top, next) => (next.observedDemand > top.observedDemand ? next : top), baselineSignals[0]);

  return {
    tenantId: request.tenantId,
    forecastId,
    windows: forecastWindows,
    createdAt: new Date().toISOString(),
    diagnostics: {
      requestId: `${request.tenantId}-${request.productId}`,
      signalCount: baselineSignals.length,
      windowCount: forecastWindows.length,
      aggregateState: state,
      topSku: topSignal?.sku ?? 'none',
      riskBand,
    },
  };
};

export const summarizeForecastWindow = (windows: readonly ForecastWindow[]): string => {
  const avgRisk = aggregateWindowRisk(windows);
  const totalUnits = windows.reduce((acc, window) => acc + window.forecastUnits, 0);
  const avgConfidence = windows.reduce((acc, window) => acc + window.confidence, 0) / Math.max(1, windows.length);
  const band = avgConfidence > 0.8 ? 'high' : avgConfidence > 0.5 ? 'medium' : 'low';
  return `forecasted ${Number(totalUnits.toFixed(2))} units, risk ${avgRisk.toFixed(2)}, confidence ${band}`;
};

export const splitScenario = (envelope: DemandEnvelope): readonly WorkloadScenario[] => {
  const grouped = new Map<AggregateState, DemandSignal[]>();
  for (const window of envelope.windows) {
    const marker: DemandSignal = {
      tenantId: envelope.tenantId,
      productId: window.slotEnd,
      sku: window.slotEnd,
      baseDemand: window.forecastUnits,
      observedDemand: window.forecastUnits,
      seasonalFactor: 1,
      confidence: window.confidence,
      sampleWindowStart: window.slotStart,
      sampleWindowEnd: window.slotEnd,
      source: 'sales',
    };
    const state = deriveState([marker]);
    const current = grouped.get(state) ?? [];
    current.push({
      tenantId: envelope.tenantId,
      productId: window.slotEnd,
      sku: window.slotEnd,
      baseDemand: window.forecastUnits,
      observedDemand: window.forecastUnits,
      seasonalFactor: 1,
      confidence: window.confidence,
      sampleWindowStart: window.slotStart,
      sampleWindowEnd: window.slotEnd,
      source: 'sales',
    });
    grouped.set(state, current);
  }

  return [...grouped.entries()].map(([state, signals], index): WorkloadScenario => {
    const scenarioWindows = sampleWindowsFromSignals(signals, index);
    const candidate = scoreAllocation({
      forecastId: envelope.forecastId,
      strategy: index === 0 ? 'baseline' : index === 1 ? 'burst' : 'throttle',
      signal: signals[0] ?? markerFallback(envelope.tenantId, 0),
      forecast: scenarioWindows,
      schedule: {
        zoneId: `zone-${index}`,
        activeWorkers: Math.max(1, signals.length * 4),
        reservedWorkers: Math.max(0, Math.floor(signals.length / 2)),
        utilizationPercent: Math.min(150, 45 + signals.length * 12),
        overtimeHours: Number((index * 1.2).toFixed(2)),
        breakRatio: state === 'hot' ? 0.12 : 0.08,
      },
      marginBuffer: clamp01(signals[0]?.confidence ?? 0.5),
      riskBand: 'medium',
    });

    return {
      id: asAllocationWindowId(`${envelope.forecastId}:${state}`) as any,
      tenantId: envelope.tenantId,
      demandProfile: signals,
      windows: scenarioWindows,
      strategy: candidate ? 'baseline' : 'burst',
      score: candidate,
      recommendation: `${state} state workload`,
    };
  });
};

const markerFallback = (tenantId: string, sequence: number): DemandSignal => ({
  tenantId,
  productId: `product-${sequence}`,
  sku: `bootstrap-${sequence}`,
  baseDemand: 1,
  observedDemand: 1,
  seasonalFactor: 1,
  confidence: 0.5,
  sampleWindowStart: new Date().toISOString(),
  sampleWindowEnd: new Date(Date.now() + 15 * 60_000).toISOString(),
  source: 'sales',
});

const sampleWindowsFromSignals = (signals: readonly DemandSignal[], index: number): readonly ForecastWindow[] => {
  const baseDate = new Date();
  const windows = buildTimeWindows(baseDate, signals.length * 15, 15).slice(0, signals.length + 1);
  return windows.map((window, signalIndex) => ({
    slotStart: toRfc3339(window.start),
    slotEnd: toRfc3339(window.end),
    forecastUnits: signals[signalIndex]?.observedDemand ?? 10,
    demandVariance: ((signals[signalIndex]?.seasonalFactor ?? 1) * (index + 1)) / 10,
    backlogRisk: ((signals[signalIndex]?.observedDemand ?? 10) % 100) / 100,
    confidence: signals[signalIndex]?.confidence ?? 0.5,
  }));
};

export const composeScenarioPlan = (scenario: WorkloadScenario, windows: readonly ForecastWindow[], intent: ForecastIntent): ForecastPlan => {
  const score = scenario.score;
  const totalRisk = aggregateWindowRisk(windows);
  const limits = estimateLimits(scenario.demandProfile);
  const utilization = scheduleSaturationScore({
    zoneId: scenario.tenantId,
    activeWorkers: Math.max(4, scenario.demandProfile.length),
    reservedWorkers: 2,
    utilizationPercent: Math.min(100, totalRisk),
    overtimeHours: limits.used % 10,
    breakRatio: Math.max(0.01, 0.08 * score / 100),
  });

  return {
    planId: `${scenario.id}-plan` as any,
    tenantId: scenario.tenantId,
    windows,
    scenario,
    riskBudget: Number((100 - totalRisk).toFixed(2)),
    selectedStrategies: utilization > 60 ? ['burst', 'throttle'] : ['baseline', 'preposition'],
    slaTargets: intent.sla,
    generatedAt: new Date(Date.now() + score * 1000).toISOString(),
  };
};
