import { ok, err } from '@shared/result';
import type { OrchestratorState, OrchestrationResult } from './types';
import type { PluginRegistry } from './plugin-registry';
import type { ExperimentIntent, ExperimentContext, ExperimentPayload, ExperimentPlan, ExperimentPhase } from '@domain/recovery-autonomy-experiment';
import type { ResultState } from '@shared/core';

export interface ExecutionPlan {
  readonly phases: readonly ExperimentPhase[];
  readonly requestId: string;
}

export const executeSequence = async <TInput, TOutput>(
  phases: readonly ExperimentPhase[],
  registry: PluginRegistry,
  request: {
    readonly intent: ExperimentIntent;
    readonly context: ExperimentContext;
    readonly payload: ExperimentPayload;
    readonly plan: ExperimentPlan;
  },
  input: TInput,
): Promise<ResultState<readonly TOutput[], Error>> => {
  const outputs: TOutput[] = [];
  for (const phase of phases) {
    const transformed = await registry.run<TInput, TOutput>(
      phase,
      input,
      { runId: request.intent.runId },
      request.intent,
    );
    outputs.push(...transformed);
    if (outputs.length > 64) {
      return err(new Error('execution limit reached'));
    }
  }
  return ok(outputs);
};

export const executeAndTrack = async <TInput, TOutput>(
  executionPlan: ExecutionPlan,
  registry: PluginRegistry,
  request: {
    readonly intent: ExperimentIntent;
    readonly context: ExperimentContext;
    readonly payload: ExperimentPayload;
    readonly plan: ExperimentPlan;
  },
  input: TInput,
): Promise<OrchestrationResult<TOutput>> => {
  const startedAt = new Date().toISOString();
  const executed = await executeSequence<TInput, TOutput>(
    executionPlan.phases,
    registry,
    request,
    input,
  );

  if (!executed.ok) {
    return {
      ok: false,
      outputs: [],
      pluginCount: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      state: {
        runId: request.intent.runId,
        running: false,
        completed: true,
        phase: request.intent.phase,
      },
      error: executed.error,
    };
  }

  return {
    ok: true,
    outputs: executed.value,
    pluginCount: executed.value.length,
    startedAt,
    finishedAt: new Date().toISOString(),
    state: {
      runId: request.intent.runId,
      running: false,
      completed: true,
      phase: executionPlan.phases.at(-1) ?? request.intent.phase,
    },
  };
};
