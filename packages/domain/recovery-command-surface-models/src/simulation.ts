import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import type { SurfacePlan, SurfaceRun, SimulationContext, SimulationResult, SurfaceSignal, SurfaceRunStep } from './types';
import { buildSurfaceRunId } from './types';
import { simulateExecution, selectParallelWindow } from './planner';
import { forecastReadiness, isHealthyRun } from './policies';

export interface ForecastBatch {
  readonly batchId: string;
  readonly commandIds: readonly string[];
  readonly projectedAt: string;
}

export interface IncidentSurfaceEnvelope {
  readonly runId: string;
  readonly runState: SurfaceRun['state'];
  readonly signalCount: number;
  readonly forecast: SimulationResult;
}

export const projectSignalWindow = (run: SurfaceRun, limit = 10): readonly SurfaceSignal[] => {
  const values = run.signals.slice(-limit);
  return values.map((signal) => ({
    ...signal,
    value: signal.value + Math.cos(Date.now() / 1000) * 2,
    timestamp: signal.timestamp,
  }));
};

export const runSimulation = (
  plan: SurfacePlan,
  run: SurfaceRun,
): {
  forecast: SimulationResult;
  batches: readonly ForecastBatch[];
} => {
  const context: SimulationContext = {
    run,
    currentTimestamp: new Date().toISOString(),
    globalBudgetMinutes: 120,
  };

  const forecast = simulateExecution(run, context);
  const windows = selectParallelWindow(run, plan.commands);
  const batchWindow: ForecastBatch = {
    batchId: randomUUID(),
    commandIds: windows.commandIds,
    projectedAt: new Date().toISOString(),
  };

  const readiness = forecastReadiness({
    run,
    policy: {
      id: withBrand('surface:policy:simulation', 'SurfacePolicyId'),
      enabled: true,
      rules: [
        {
          id: withBrand(`sim:rule:${run.id}`, 'SurfaceRuleId'),
          name: 'time-budget',
          description: 'Keep batches under budget',
          appliesToKind: ['stabilize', 'verify'],
          maxRiskThreshold: 50,
          minSignalRatio: 0.6,
          recommendedWindowMinutes: 8,
        },
      ],
    },
    signalWindow: run.signals,
    commandKinds: plan.commands.map((command) => command.kind),
  });

  const planPolicy = forecastReadiness({
    run,
    policy: {
      id: withBrand('surface:policy:plan', 'SurfacePolicyId'),
      enabled: true,
      rules: [
        {
          id: withBrand(`sim:rule:${plan.id}`, 'SurfaceRuleId'),
          name: 'time-budget',
          description: 'Keep batches under budget',
          appliesToKind: ['stabilize', 'verify'],
          maxRiskThreshold: 50,
          minSignalRatio: 0.6,
          recommendedWindowMinutes: 8,
        },
      ],
    },
    signalWindow: run.signals,
    commandKinds: plan.commands.map((command) => command.kind),
  });

  const batchCount = Math.max(1, windows.commandIds.length || 1);
  const batches: ForecastBatch[] = new Array(batchCount).fill(0).map((_, index) => ({
    batchId: `${batchWindow.batchId}-${index}`,
    commandIds: batchWindow.commandIds,
    projectedAt: new Date(Date.now() + index * 60_000).toISOString(),
  }));

  return {
    forecast: {
      ...forecast,
      predictedRisk: forecast.predictedRisk + readiness.projectedSloRisk + planPolicy.projectedSloRisk,
    },
    batches,
  };
};

export const emitEnvelope = (
  run: SurfaceRun,
  signalWindow: readonly SurfaceSignal[],
): IncidentSurfaceEnvelope => {
  const readiness = isHealthyRun(run, 40);
  const forecast = simulateExecution(run, {
    run,
    currentTimestamp: new Date().toISOString(),
    globalBudgetMinutes: readiness ? 360 : 120,
  });
  return {
    runId: run.id,
    runState: run.state,
    signalCount: signalWindow.length,
    forecast,
  };
};

export const parseSimulationConfig = (
  text: string,
): { readonly windows: number; readonly cap: number } => {
  const [windowText, capText] = text.split(',');
  const windows = Number(windowText.trim());
  const cap = Number(capText?.trim() ?? '');
  return {
    windows: Number.isFinite(windows) ? Math.max(1, windows) : 1,
    cap: Number.isFinite(cap) ? Math.max(1, cap) : 5,
  };
};

export const markForecastSteps = (run: SurfaceRun, signalWindow: readonly SurfaceSignal[]): readonly SurfaceRunStep[] => {
  return run.steps.map((step) => {
    const signalCount = signalWindow.filter((signal) => signal.key.includes(step.commandId)).length;
    return {
      ...step,
      output: {
        ...step.output,
        signalCount,
        reviewedAt: new Date().toISOString(),
      },
    };
  });
};

export const cloneForRun = (run: SurfaceRun): SurfaceRun => ({
  ...run,
  id: buildSurfaceRunId(run.planId, `${run.id}-sim`),
  createdAt: new Date().toISOString(),
  startedAt: run.startedAt,
  steps: run.steps,
  signals: [...run.signals],
});
