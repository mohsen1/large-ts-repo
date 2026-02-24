import type { PluginCatalog, PluginStage, PluginExecutionInput, PluginExecutionOutput } from '@shared/lab-simulation-kernel';
import { inferWindowScore, type SignalWindow, type SignalStudioPlan, buildPlanFingerprint } from './models';
import { type WorkspaceCommand, type StudioInput, parseWorkspaceInput } from './schema';
import type { NoInfer } from '@shared/type-level';

export interface PlanRequest {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
}

export interface PlanDiff {
  readonly additions: readonly string[];
  readonly removals: readonly string[];
  readonly keeps: readonly string[];
}

export const makePlanFingerprint = (plan: SignalStudioPlan): string => buildPlanFingerprint(plan);

export const createExecutionPlan = <TCatalog extends PluginCatalog>(
  tenant: string,
  scenario: string,
  catalog: NoInfer<TCatalog>,
): SignalStudioPlan => {
  const pluginNames = catalog.map((item) => item.name);
  const confidence = Math.min(1, pluginNames.length / 4);
  return {
    scenario: `${tenant}::${scenario}` as any,
    steps: [...pluginNames],
    confidence,
  };
};

export const calculatePlanRisk = (windows: readonly SignalWindow[]): number => {
  if (windows.length === 0) {
    return 0;
  }
  const total = windows.map(inferWindowScore).reduce((acc, value) => acc + value, 0);
  return Math.max(0, Math.min(1, total / windows.length));
};

export const comparePlans = (left: readonly string[], right: readonly string[]): PlanDiff => {
  const rightSet = new Set(right);
  const leftSet = new Set(left);
  return {
    additions: right.filter((name) => !leftSet.has(name)),
    removals: left.filter((name) => !rightSet.has(name)),
    keeps: left.filter((name) => rightSet.has(name)),
  };
};

export const summarizeRunOutput = <TOutput>(
  stage: PluginStage,
  outputs: readonly PluginExecutionOutput<TOutput>[],
): string => {
  const summary = outputs
    .map((output) => `${stage}:${output.plugin}(${output.durationMs.toFixed(1)}ms:${output.warnings.length})`)
    .join(' | ');
  return summary;
};

export const buildInput = <T>(
  tenant: string,
  workspace: string,
  scenario: string,
  payload: T,
): PluginExecutionInput<T> => {
  const safe = parseWorkspaceInput({
    tenant,
    workspace,
    scenarioId: scenario,
  });

  return {
    tenant: safe.tenant as any,
    planId: `${workspace}::${scenario}` as any,
    runId: `${tenant}-${workspace}::${scenario}` as any,
    stage: 'detect',
    payload,
    context: {
      workspace,
      scenario,
      filters: safe.pluginFilter,
    },
  };
};

export const summarizeCommand = (command: WorkspaceCommand): string => `${command.workspace}:${command.command}`;

export const validateInput = (input: Partial<PlanRequest>): boolean => {
  return typeof input.tenant === 'string' && input.tenant.length > 0;
};
