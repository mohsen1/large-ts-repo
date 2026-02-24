import type { ReadinessLabExecutionInput, ReadinessLabExecutionOutput, ReadinessLabStep } from './readiness-lab-core';
import type { ReadinessLabPlugin } from './readiness-lab-plugin';

export type StageTemplate<TStep extends ReadinessLabStep = ReadinessLabStep> = {
  readonly step: TStep;
  readonly enabled: boolean;
  readonly weight: number;
};

export type StageTuple<TStages extends readonly StageTemplate[]> = TStages;

export type StagePath<TStages extends readonly StageTemplate[]> = TStages extends readonly [infer THead extends StageTemplate, ...infer TRest extends readonly StageTemplate[]]
  ? `${THead['step']}/${TRest['length']}`
  : never;

export type StageIndexMap<TStages extends readonly StageTemplate[]> = {
  [K in keyof TStages as K extends `${number}`
    ? `stage/${K}`
    : never]: TStages[K] extends StageTemplate<infer TStep> ? TStep : never;
};

export type AggregateStageContext<TStages extends readonly StageTemplate[]> = {
  readonly manifest: StagePath<TStages>;
  readonly stages: StageTuple<TStages>;
  readonly order: ReadonlyArray<number>;
};

export type StageResult<TContext> = Readonly<{
  readonly step: Readonly<TContext>;
  readonly input: ReadinessLabExecutionInput;
  readonly output: ReadinessLabExecutionOutput;
}>;

export interface ReadinessLabDslPlan<TStages extends readonly StageTemplate[]> {
  readonly stages: StageTuple<TStages>;
  readonly context: AggregateStageContext<TStages>;
  readonly execute: (input: ReadinessLabExecutionInput) => Promise<StageResult<TStages>>;
}

export const composeReadinessLabStages = <TStages extends readonly StageTemplate[]>(...stages: TStages): TStages => stages;

export interface ReadinessLabPlanRuntime<TStages extends readonly StageTemplate[]> {
  readonly plan: ReadinessLabDslPlan<TStages>;
  readonly plugins: readonly ReadinessLabPlugin<ReadinessLabStep, ReadinessLabExecutionInput, ReadinessLabExecutionOutput>[];
}

export const buildReadinessLabDsl = <TStages extends readonly StageTemplate[]>(input: {
  readonly stages: TStages;
  readonly plugins: readonly ReadinessLabPlugin<ReadinessLabStep, ReadinessLabExecutionInput, ReadinessLabExecutionOutput>[];
}): ReadinessLabPlanRuntime<TStages> => {
  const stageDefs = composeReadinessLabStages(...(input.stages as unknown as TStages));
  const runOrder = stageDefs.flatMap((stage, index) => (stage.enabled ? [index] : []));
  const context: AggregateStageContext<TStages> = {
    manifest: `discover/${stageDefs.length}` as StagePath<TStages>,
    stages: stageDefs,
    order: runOrder,
  };

  const execute = async (executionInput: ReadinessLabExecutionInput): Promise<StageResult<TStages>> => {
    const orderedPlugins = input.plugins.filter((plugin) => runOrder.some((index) => input.stages[index]?.step === plugin.step));
    const outputs: ReadinessLabExecutionOutput[] = [];

    let currentInput: ReadinessLabExecutionInput = executionInput;
    for (const plugin of orderedPlugins) {
      const pluginOutput = await plugin.execute(currentInput, { signal: new AbortController().signal });
      currentInput = {
        ...currentInput,
        context: {
          ...currentInput.context,
          enabledChannels: currentInput.context.enabledChannels,
        },
      };
      outputs.push(pluginOutput);
    }

      return {
      step: context.stages,
      input: executionInput,
      output: outputs.at(-1) ?? {
        runId: executionInput.plan.runId,
        planId: `${executionInput.plan.planId}` as ReadinessLabExecutionOutput['planId'],
        generatedSignals: [],
        warnings: ['no-output'],
      },
    };
  };

  return {
    plan: {
      stages: stageDefs,
      context,
      execute,
    },
    plugins: input.plugins,
  } satisfies ReadinessLabPlanRuntime<TStages>;
};

const pluginStepContext = <TStages extends readonly StageTemplate[]>(
  context: AggregateStageContext<TStages>,
): StageTuple<TStages> => {
  const ordered = context.order
    .map((index) => context.stages[index])
    .filter((stage): stage is TStages[number] => stage !== undefined);
  return ordered as unknown as StageTuple<TStages>;
};
