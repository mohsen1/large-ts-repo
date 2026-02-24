import {
  IncidentLabRun,
  IncidentLabPlan,
  IncidentLabSignal,
} from '@domain/recovery-incident-lab-core';
import { RecoveryIncidentLabRepository } from './repository';
import { LabStoreResult } from './types';

export interface InsightSignal {
  readonly totalSignals: number;
  readonly averageSignalValue: number;
  readonly maxSignalValue: number;
}

export interface InsightRun {
  readonly runId: string;
  readonly scenarioId: string;
  readonly totalTicks: number;
  readonly completedSteps: number;
  readonly status: IncidentLabRun['state'];
}

export interface InsightPlan {
  readonly planId: string;
  readonly scenarioId: string;
  readonly queued: number;
  readonly ordered: number;
}

export interface SnapshotReport {
  readonly asOf: string;
  readonly scenarioCount: number;
  readonly planCount: number;
  readonly runCount: number;
  readonly signalSummary: InsightSignal;
  readonly topRuns: readonly InsightRun[];
  readonly topPlans: readonly InsightPlan[];
}

const summarizeSignals = (signals: readonly IncidentLabSignal[]): InsightSignal => {
  const numericSignals = signals.map((signal) => Number(signal.value)).filter((value) => Number.isFinite(value));
  const totalSignals = numericSignals.length;
  const averageSignalValue = totalSignals === 0 ? 0 : numericSignals.reduce((acc, value) => acc + value, 0) / Math.max(1, totalSignals);

  return {
    totalSignals,
    averageSignalValue,
    maxSignalValue: numericSignals.length > 0 ? Math.max(...numericSignals) : 0,
  };
};

export const buildInsightSnapshot = async (
  repository: RecoveryIncidentLabRepository,
): Promise<LabStoreResult<SnapshotReport>> => {
  const scenarios = await repository.listScenarios({});
  const plans = await repository.listPlansByScenario('__all__');
  const allRuns = await repository.listRuns({});

  const topRuns: InsightRun[] = allRuns.items
    .slice(0, 5)
    .map((run: IncidentLabRun) => ({
      runId: run.runId,
      scenarioId: run.scenarioId,
      totalTicks: run.results.length,
      completedSteps: run.results.filter((result) => result.status === 'done').length,
      status: run.state,
    }));

  const topPlans: InsightPlan[] = plans.items.slice(0, 5).map((plan: IncidentLabPlan) => ({
    planId: plan.id,
    scenarioId: plan.scenarioId,
    queued: plan.state === 'ready' ? plan.queue.length : 0,
    ordered: plan.orderedAt.length,
  }));

  const allSignals: IncidentLabSignal[] = [];
  for (const scenario of scenarios.items) {
    const run = await repository.loadLatestRunByScenario(scenario.id);
    if (run.ok) {
      for (const [index, result] of run.value.results.entries()) {
        allSignals.push({
          node: scenario.id,
          kind: 'dependency',
          value: result.logs.length + index,
          at: result.finishAt,
        });
      }
    }
  }

  return {
    ok: true,
    value: {
      asOf: new Date().toISOString(),
      scenarioCount: scenarios.total,
      planCount: plans.total,
      runCount: allRuns.total,
      signalSummary: summarizeSignals(allSignals),
      topRuns,
      topPlans,
    },
  };
};
