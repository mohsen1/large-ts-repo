import type { OrchestrationInput, WorkloadOrchestrator, ForecastResponse } from './types';
import type { WorkloadNode } from '@domain/recovery-workload-intelligence';
import { createWorkloadOrchestrator } from './engine';
import { runControls, type ControlSignal } from './controls';
import { fail, ok, type Result } from '@shared/result';

export interface LifecyclePolicy {
  readonly allowControl: boolean;
  readonly minimumNodes: number;
  readonly maxWarnings: number;
}

export interface LifecycleResult {
  readonly id: string;
  readonly forecast: ForecastResponse;
  readonly controls: readonly ControlSignal[];
  readonly health: 'ok' | 'degraded' | 'blocked';
}

const canRun = (input: OrchestrationInput, policy: LifecyclePolicy): boolean =>
  policy.minimumNodes <= input.graph.nodes.length;

const healthFromWarnings = (warnings: readonly string[], policy: LifecyclePolicy): 'ok' | 'degraded' | 'blocked' => {
  if (warnings.length > policy.maxWarnings) {
    return 'blocked';
  }
  if (warnings.length > 0) {
    return 'degraded';
  }
  return 'ok';
}

const pickCriticalNodes = (nodes: readonly WorkloadNode[]): readonly WorkloadNode['id'][] =>
  nodes
    .filter((node) => node.criticality >= 4)
    .sort((left, right) => right.criticality - left.criticality)
    .map((node) => node.id);

export const executeLifecycle = async (
  input: OrchestrationInput,
  policy: LifecyclePolicy,
): Promise<Result<LifecycleResult, string>> => {
  if (!canRun(input, policy)) {
    return fail('lifecycle policy blocks execution');
  }
  const orchestrator: WorkloadOrchestrator = createWorkloadOrchestrator(input);
  const forecastResult = await orchestrator.evaluate();
  if (!forecastResult.ok) {
    return fail(forecastResult.error);
  }

  const controls = await runControls({
    repository: input.repository,
    mode: input.mode,
  });
  if (!controls.ok) {
    return fail(controls.error);
  }

  const health = healthFromWarnings(forecastResult.value.warnings, policy);
  return ok({
    id: `${input.mode}-${Date.now()}`,
    forecast: forecastResult.value,
    controls: controls.value,
    health,
  });
};

export const describeLifecycle = (result: LifecycleResult): string =>
  `${result.id} · health=${result.health} plans=${result.forecast.planGroups.length} controls=${result.controls.length}`;

export const criticalNodesSummary = (input: OrchestrationInput): readonly WorkloadNode['id'][] =>
  pickCriticalNodes(input.graph.nodes);
