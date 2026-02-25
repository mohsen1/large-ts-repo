import { withBrand, type Brand } from '@shared/core';
import { type PlanResult } from './models';

export type StageInput<T> = T;
export type StageOutput<T> = T;
export type MaybeAsync<T> = T | Promise<T>;

export interface PipelineStageContext {
  runId: Brand<string, 'AutomationRunId'>;
  metadata: Record<string, string | number | boolean>;
}

export type StageTransform<TInput, TOutput> = (
  input: StageInput<TInput>,
  ctx: PipelineStageContext,
) => MaybeAsync<StageOutput<TOutput>>;

export interface PipelineDefinition<
  TInput,
  TStages extends readonly StageTransform<any, any>[] = readonly StageTransform<any, any>[],
> {
  readonly id: string;
  readonly runId: Brand<string, 'AutomationRunId'>;
  readonly version: `${number}.${number}.${number}`;
  readonly stages: TStages;
  readonly createdAt: string;
}

export class AutomationPipeline<TInput> {
  private readonly stages: readonly StageTransform<any, any>[];
  private readonly context: PipelineStageContext;

  constructor(definition: Omit<PipelineDefinition<TInput>, 'stages'> & {
    readonly stages: readonly StageTransform<any, any>[];
  }) {
    this.stages = definition.stages;
    this.context = {
      runId: definition.runId,
      metadata: { pipeline: definition.id, stageCount: definition.stages.length },
    };
  }

  async run(input: TInput): Promise<PlanResult<string>> {
    let current: unknown = input;
    const started = Date.now();
    for (const stage of this.stages) {
      current = await stage(current, this.context);
    }
    const elapsed = Date.now() - started;
    return {
      planId: withBrand(`plan-${this.context.runId}`, 'PlaybookAutomationRunId'),
      runId: withBrand(this.context.runId, 'PlaybookAutomationRunId'),
      status: 'success',
      score: current === null ? 0.5 : 1,
      warnings: elapsed > 5000 ? (['pipeline-latency'] as const) : [],
      metadata: {
        elapsedMs: elapsed,
        stageCount: this.stages.length,
      },
    };
  }
}

export const buildPipeline = <
  TInput,
>(
  stages: readonly StageTransform<any, any>[],
  runId: Brand<string, 'AutomationRunId'>,
): AutomationPipeline<TInput> =>
  new AutomationPipeline<TInput>({
    id: `pipeline-${runId}`,
    runId,
    version: '1.0.0',
    stages: [...stages] as readonly StageTransform<any, any>[],
    createdAt: new Date().toISOString(),
  });

export const composeStages = <TStages extends readonly StageTransform<any, any>[]>(
  ...stages: TStages
): TStages => stages;
