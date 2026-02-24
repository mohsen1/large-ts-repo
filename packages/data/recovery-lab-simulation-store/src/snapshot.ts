import { asLabTenantId, asLabRunId, asLabScenarioId, asLabPluginId } from '@shared/recovery-lab-kernel';
import type {
  LabExecution,
  LabExecutionResult,
  LabSignal,
  LabScenario,
  StepOutput,
} from '@domain/recovery-simulation-lab-core';

const toNumeric = (value: string, fallback: number): number => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export interface SnapshotEvent {
  readonly at: string;
  readonly tenant: string;
  readonly kind: 'execution' | 'result' | 'signal';
  readonly payload: string;
}

export interface StoreSnapshotBundle {
  readonly tenant: string;
  readonly scenario: LabScenario | null;
  readonly execution: LabExecution | null;
  readonly result: LabExecutionResult | null;
  readonly signalCount: number;
}

export const hydrateSnapshot = async <T>(factory: () => Promise<T>): Promise<T> => {
  return await factory();
};

export const summarizeSignals = (signals: readonly LabSignal[]): number =>
  signals.reduce((total, signal) => total + toNumeric(`${signal.value}`, 0), 0);

export const summarizeResult = (result: LabExecutionResult): SnapshotEvent => ({
  at: new Date(result.steps[0]?.status === 'ok' ? result.steps[0].message : 'pending').toLocaleString(),
  tenant: `${result.context.tenant}`,
  kind: 'result',
  payload: `${result.health}:${result.status}`,
});

export const asEventLog = (execution: LabExecution): SnapshotEvent[] => {
  return execution.pluginIds.map((pluginId, index) => ({
    at: new Date(Date.now() + index * 10).toISOString(),
    tenant: `${execution.tenant}`,
    kind: 'execution',
    payload: `${pluginId}`,
  }));
};

export const buildBundle = (
  tenant: string,
  scenario: LabScenario | null,
  execution: LabExecution | null,
  result: LabExecutionResult | null,
  steps: readonly StepOutput[],
): StoreSnapshotBundle => {
  const signalCount = scenario ? summarizeSignals(scenario.signals) : 0;
  return {
    tenant: `${asLabTenantId(tenant)}`,
    scenario,
    execution: execution && {
      ...execution,
      executionId: asLabRunId(execution.executionId),
      scenarioId: asLabScenarioId(execution.scenarioId),
      tenant: asLabTenantId(`${execution.tenant}`),
    },
    result,
    signalCount,
  };
};

export const collectPluginIds = (steps: readonly StepOutput[]): readonly string[] => {
  const ids = [...steps].map((step, index) => `${step.message}:${index}`);
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  }).map((id) => `${asLabPluginId(id)}` as string);
};
