import type { LabExecutionResult, LabExecution, LabScenario, LabSignal } from '@domain/recovery-simulation-lab-core';
import type { RecoveryLabStore } from '@data/recovery-lab-simulation-store';
import type { RecoveryLabRuntime } from '@service/recovery-lab-orchestrator';
import { asLabTenantId } from '@shared/recovery-lab-kernel';

export interface ScenarioSummary {
  readonly scenarioId: string;
  readonly lane: string;
  readonly labels: readonly string[];
  readonly risk: number;
}

const safeScore = (signals: readonly LabSignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }
  const high = signals.filter((signal) => signal.severity === 'high' || signal.severity === 'critical').length;
  return high / signals.length;
};

export const summarizeScenario = (scenario: LabScenario): ScenarioSummary => ({
  scenarioId: scenario.scenarioId,
  lane: scenario.lane,
  labels: scenario.labels,
  risk: safeScore(scenario.signals),
});

export const buildRecentHistory = async (
  store: RecoveryLabStore,
  runtime: RecoveryLabRuntime,
  tenant: string,
): Promise<readonly string[]> => {
  const snapshot = await store.queryStore({ tenant });
  const executionRows: LabExecution[] = [];
  for (const runId of snapshot.runIds) {
    const run = await store.runs.getRun(tenant, runId);
    if (run) {
      executionRows.push(run);
    }
  }

  const lifecycle = await runtime.collect();
  return [...executionRows.map((run) => run.executionId), ...lifecycle.map((entry) => entry.context.traceId)];
};

export const resultLine = (tenant: string, result: LabExecutionResult): string => {
  return `${asLabTenantId(tenant)}:${result.execution.executionId}:${result.status}:${result.health}`;
};
