import { ForecastWindow, ResourceSchedule, CandidateAllocation, WorkloadScenario, DemandSignal, ForecastPlan } from './models';
import { scoreAllocationBundle, selectTopAllocation, isAboveThreshold } from './scoring';
import { summarizeForecastWindow, composeScenarioPlan, splitScenario, DemandEnvelope, ForecastIntent } from './forecast';

export interface SchedulingInput {
  tenantId: string;
  demandSignals: readonly DemandSignal[];
  windows: readonly ForecastWindow[];
  intent: ForecastIntent;
}

export interface SchedulingOutput {
  allocations: readonly CandidateAllocation[];
  topPick?: CandidateAllocation;
  scenarioPlan?: ForecastPlan;
  note: string;
}

export const makeAllocation = (input: SchedulingInput, envelope: DemandEnvelope): SchedulingOutput => {
  const scenarios = splitScenario(envelope);
  const windows = envelope.windows;

  const candidates: CandidateAllocation[] = scenarios.map((scenario, index) => ({
    forecastId: envelope.forecastId,
    strategy: index % 2 === 0 ? 'baseline' : 'burst',
    signal: scenario.demandProfile[0] ?? {
      tenantId: input.tenantId,
      productId: 'unknown',
      sku: 'unknown',
      baseDemand: 0,
      observedDemand: 0,
      seasonalFactor: 1,
      confidence: 0.5,
      sampleWindowStart: new Date().toISOString(),
      sampleWindowEnd: new Date().toISOString(),
      source: 'sales',
    },
    forecast: windows,
    schedule: pickSchedule(input.tenantId, index, scenario),
    marginBuffer: 0.15 * (index + 1),
    riskBand: index % 3 === 0 ? 'low' : index % 3 === 1 ? 'medium' : 'high',
  }));

  const ranked = scoreAllocationBundle(candidates, {
    riskWeight: 0.5,
    demandWeight: 0.3,
    utilizationWeight: 0.2,
  });

  const top = selectTopAllocation(ranked);
  const scenario = scenarios[0];
  const plan = scenario ? composeScenarioPlan(scenario, windows, input.intent) : undefined;
  const note = `allocated ${candidates.length} candidates for ${input.tenantId} with confidence ${summarizeForecastWindow(windows)}`;
  const isHealthy = isAboveThreshold(ranked, 6);

  return {
    allocations: candidates,
    topPick: top?.allocation,
    scenarioPlan: isHealthy ? plan : undefined,
    note,
  };
};

const pickSchedule = (tenantId: string, index: number, scenario: WorkloadScenario): ResourceSchedule => ({
  zoneId: `${tenantId}-${scenario.id}-${index}`,
  activeWorkers: Math.max(1, scenario.demandProfile.length + index + 1),
  reservedWorkers: index,
  utilizationPercent: Math.min(150, 25 + index * 35 + scenario.score / 2),
  overtimeHours: (index * 0.75) % 4,
  breakRatio: 0.05 + (index * 0.02),
});

export const expandWindow = (window: ForecastWindow, growMinutes: number): ForecastWindow => {
  const expandedStart = new Date(new Date(window.slotStart).getTime() - growMinutes * 60_000).toISOString();
  const expandedEnd = new Date(new Date(window.slotEnd).getTime() + growMinutes * 60_000).toISOString();
  return {
    ...window,
    slotStart: expandedStart,
    slotEnd: expandedEnd,
    forecastUnits: Number((window.forecastUnits * 1.15).toFixed(2)),
    demandVariance: Number((window.demandVariance + 0.03).toFixed(4)),
  };
};

export const summarizeAllocation = (allocation: CandidateAllocation): string => {
  return `${allocation.forecastId}: strategy=${allocation.strategy}, risk=${allocation.riskBand}, workers=${allocation.schedule.activeWorkers}`;
};

export const expandScenarios = (plan: ForecastPlan): ForecastWindow[] => plan.windows.map((window) => expandWindow(window, 15));
