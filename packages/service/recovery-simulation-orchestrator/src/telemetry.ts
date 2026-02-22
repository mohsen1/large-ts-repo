import type { SimulationRunRecord } from '@domain/recovery-simulation-core';

export interface SimulationTelemetry {
  readonly totalDurationMs: number;
  readonly commandCount: number;
  readonly riskScore: number;
}

export const measureRun = (run: SimulationRunRecord): SimulationTelemetry => ({
  totalDurationMs: run.totalDurationMs ?? 0,
  commandCount: run.executedSteps.length,
  riskScore: run.residualRiskScore,
});

export const reportTelemetry = (run: SimulationRunRecord): string => {
  const metrics = measureRun(run);
  return `duration=${metrics.totalDurationMs}ms,commands=${metrics.commandCount},risk=${metrics.riskScore.toFixed(3)}`;
};
