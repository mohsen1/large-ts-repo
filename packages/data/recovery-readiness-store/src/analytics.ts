import type { ReadinessReadModel } from './models';
import { sortByRiskBand } from './queries';
import { calculateWindowDensity, estimateRecoveryCapacity } from '@domain/recovery-readiness';
import type { TimeWindow } from '@domain/recovery-readiness'
export interface RepositoryHealth {
  runId: ReadinessReadModel['plan']['runId'];
  signalCount: number;
  directiveCount: number;
  riskBand: ReadinessReadModel['plan']['riskBand'];
  score: number;
}

export interface ReadinessInventory {
  totalRuns: number;
  redBandRuns: number;
  amberBandRuns: number;
  greenBandRuns: number;
  topRunId?: ReadinessReadModel['plan']['runId'];
}

export function scoreReadinessModel(model: ReadinessReadModel): number {
  const signalContribution = model.signals.length;
  const directiveContribution = model.directives.length * 2;
  const windows = model.plan.windows.map(toTimeWindow);
  const windowContribution = calculateWindowDensity(windows);
  const directiveSignalBalance = Math.max(1, Math.min(4, (directiveContribution + signalContribution) / 2));
  const riskFactor = model.plan.riskBand === 'red' ? 0.5 : model.plan.riskBand === 'amber' ? 0.8 : 1;

  const recoveryCapacity = Math.max(0, estimateRecoveryCapacity(windows));
  return Number(((windowContribution * 0.5 + directiveSignalBalance + recoveryCapacity) * riskFactor).toFixed(2));
}

export function inventory(models: readonly ReadinessReadModel[]): ReadinessInventory {
  const red = models.filter((model) => model.plan.riskBand === 'red').length;
  const amber = models.filter((model) => model.plan.riskBand === 'amber').length;
  const green = models.filter((model) => model.plan.riskBand === 'green').length;
  const sorted = sortByRiskBand([...models]);

  return {
    totalRuns: models.length,
    redBandRuns: red,
    amberBandRuns: amber,
    greenBandRuns: green,
    topRunId: sorted[0]?.plan.runId,
  };
}

export function readModelHealths(models: readonly ReadinessReadModel[]): RepositoryHealth[] {
  return models
    .map((model) => ({
      runId: model.plan.runId,
      signalCount: model.signals.length,
      directiveCount: model.directives.length,
      riskBand: model.plan.riskBand,
      score: scoreReadinessModel(model),
    }))
    .sort((left, right) => right.score - left.score);
}

function toTimeWindow(window: ReadinessReadModel['plan']['windows'][number]): TimeWindow {
  const owner = window.label ?? window.windowId;
  const spanMinutes = Math.max(1, (Date.parse(window.toUtc) - Date.parse(window.fromUtc)) / (1000 * 60));

  return {
    startUtc: window.fromUtc,
    endUtc: window.toUtc,
    owner,
    capacity: Math.max(1, spanMinutes),
  };
}
