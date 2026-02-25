import type { EventName, NoInfer, TemplatePath } from '@shared/fault-intel-runtime';
import type { IncidentSignal } from './models';

export interface PipelineStep<Input, Output> {
  readonly name: string;
  readonly kind: EventName<'pipeline', string>;
  readonly run: (input: Input) => Promise<Output> | Output;
}

export type StepResult<TStep extends PipelineStep<any, any>> = TStep extends PipelineStep<any, infer Output> ? Output : never;
export type StepInput<TStep extends PipelineStep<any, any>> = TStep extends PipelineStep<infer Input, any> ? Input : never;

export type InferStepOutput<
  TSteps extends readonly PipelineStep<any, any>[],
  TSeed
> = TSteps extends readonly [infer Head, ...infer Tail]
  ? Head extends PipelineStep<TSeed, infer Output>
    ? Tail extends readonly PipelineStep<Output, any>[]
      ? InferStepOutput<Tail, Output>
      : Output
    : never
  : TSeed;

export type PipelineRoute = TemplatePath<['fault', 'intel', 'pipeline']>;

export interface PipelineState<TSignal extends IncidentSignal> {
  readonly signals: readonly TSignal[];
  readonly route: PipelineRoute;
  readonly metadata: {
    readonly phase: number;
    readonly startedAt: string;
    readonly updatedAt: string;
  };
}

export interface PipelineRunOptions {
  readonly dryRun: boolean;
  readonly maxDepth: number;
}

export const inferSeverity = (severity: IncidentSignal['severity']): EventName<'severity', typeof severity> => {
  return `severity:${severity}:observed` as const;
};

export const appendPipelineState = <TSignal extends IncidentSignal>(
  states: readonly PipelineState<TSignal>[],
): PipelineState<TSignal>[] => {
  if (states.length === 0) {
    return [];
  }
  return states.reduce((acc, state, index) => {
    const previous = acc[index - 1];
    return [...acc, {
      ...state,
      metadata: {
        ...state.metadata,
        phase: previous?.metadata.phase ? previous.metadata.phase + 1 : 0,
      },
    }];
  }, [] as PipelineState<TSignal>[]);
};

export class SignalPipeline<TSeed extends readonly IncidentSignal[]> {
  private readonly route = 'fault.intel.pipeline' as PipelineRoute;
  private readonly steps: readonly PipelineStep<TSeed[number], TSeed[number]>[];
  constructor(
    steps: readonly PipelineStep<TSeed[number], TSeed[number]>[],
    private readonly options: PipelineRunOptions,
  ) {
    this.steps = steps;
  }

  public getRoute(): PipelineRoute {
    return this.route;
  }

  public async run(
    input: TSeed,
    options?: NoInfer<PipelineRunOptions>,
  ): Promise<TSeed[number][]> {
    const effective = options ?? this.options;
    let current = input;
    const output: TSeed[number][] = [];

    for (const step of this.steps) {
      const next = await Promise.resolve(step.run(current as any));
      if (Array.isArray(next)) {
        output.push(...(next as TSeed[number][]));
      } else {
        output.push(next as TSeed[number]);
      }
      current = [next as TSeed[number]] as unknown as TSeed;
      if (effective.maxDepth <= 0) {
        break;
      }
    }
    return output;
  }

  public async execute<
    TSignal extends TSeed[number],
    TSteps extends readonly PipelineStep<TSignal, TSignal>[]
  >(seed: readonly TSignal[], steps: TSteps): Promise<{
    readonly route: PipelineRoute;
    readonly output: InferStepOutput<TSteps, TSignal>;
  }> {
    let output: any = seed;
    for (const step of steps) {
      output = await step.run(output);
    }
    return {
      route: this.route,
      output,
    };
  }
}
