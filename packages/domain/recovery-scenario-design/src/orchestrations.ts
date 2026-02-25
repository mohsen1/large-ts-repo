import { Brand } from '@shared/type-level';
import {
  StageMetricsName,
  StageStatus,
  StageVertex,
  StageKind,
} from './topology';
import { ScenarioId, ScenarioRunId, ScenarioStageId } from './identity';

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type IdentityRecord<T extends string> = Brand<T, 'IdentityRecord'>;

export interface StageFrame<TInput, TOutput> {
  readonly index: number;
  readonly startedAt: number;
  readonly stageId: ScenarioStageId;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly status: StageStatus;
}

export interface OrchestrationRunContext<TInput = unknown, TOutput = unknown> {
  readonly scenarioId: ScenarioId;
  readonly runId: ScenarioRunId;
  readonly startedAt: number;
  readonly input: TInput;
  readonly output?: TOutput;
}

export type StageResult<TOutput> =
  | { readonly status: 'ok'; readonly output: TOutput }
  | { readonly status: 'retry'; readonly output?: TOutput; readonly retryAfterMs: number }
  | { readonly status: 'skip'; readonly reason: string }
  | { readonly status: 'error'; readonly error: Error };

export type StageFn<TOutput> = (
  context: Readonly<OrchestrationRunContext<unknown, unknown>>,
  input: unknown,
  trace: ScenarioTrace,
) => Promise<StageResult<TOutput>>;

export interface StageAdapter<TOutput> {
  readonly kind: StageKind;
  readonly transform: StageFn<TOutput>;
}

export interface ScenarioTrace {
  readonly namespace: string;
  readonly correlationId: string & Brand<string, 'scenario-correlation-id'>;
  checkpoints: string[];
}

export interface StageTemplate<TContext, TInput, TOutput> {
  readonly id: ScenarioStageId;
  readonly kind: StageKind;
  readonly inputShape: TInput;
  readonly outputShape: TOutput;
  readonly adapter: StageAdapter<TOutput>;
}

export type AnyStageTemplate = StageTemplate<unknown, unknown, unknown>;

export type StageTemplateMap<T extends readonly StageTemplate<unknown, unknown, unknown>[]> = {
  readonly [K in T[number]['kind']]: StageTemplate<unknown, unknown, unknown>;
};

export type StageOutput<T> = T extends StageTemplate<any, any, infer O> ? O : never;

export interface PipelineFrame<TTemplate extends AnyStageTemplate, TOutput> {
  readonly stage: TTemplate;
  readonly output: TOutput;
  readonly status: 'ok' | 'failed';
}

export interface PipelineResult<TInput extends readonly AnyStageTemplate[], TOutput> {
  readonly status: 'done' | 'partial' | 'failed';
  readonly frames: readonly PipelineFrame<TInput[number], TOutput>[];
}

export class ScenarioRuntime<TInput extends object, TOutput> {
  readonly #trace: ScenarioTrace;
  readonly #history: StageFrame<TInput, TOutput>[] = [];

  constructor(trace: ScenarioTrace) {
    this.#trace = trace;
  }

  record(frame: StageFrame<TInput, TOutput>): void {
    this.#history.push(frame);
  }

  get history(): ReadonlyArray<StageFrame<TInput, TOutput>> {
    return this.#history;
  }

  get trace(): ScenarioTrace {
    return this.#trace;
  }

  get checkpointCount(): number {
    return this.#trace.checkpoints.length;
  }

  checkpoint(label: string): void {
    this.#trace.checkpoints = [...this.#trace.checkpoints, label];
  }
}

export type OrchestrationContext<T extends object> = {
  readonly scenarioId: ScenarioId;
  readonly startedAt: number;
  readonly correlationId: string & Brand<string, 'orch'>;
  readonly context: Readonly<T>;
};

export function withTrace<const T extends string>(namespace: T, correlationId: string): ScenarioTrace {
  return {
    namespace,
    correlationId: correlationId as string & Brand<string, 'scenario-correlation-id'>,
    checkpoints: [],
  };
}

export type VariadicTail<T extends readonly unknown[]> = T extends readonly [any, ...infer TRest]
  ? TRest
  : [];

export type RecursivelyExpand<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...RecursivelyExpand<VariadicTail<T>>]
  : [];

export function composeAdapters<TStages extends readonly AnyStageTemplate[]>(
  _stages: NoInfer<TStages>,
): StageOutput<TStages[number]>[] {
  const output: StageOutput<TStages[number]>[] = [];
  return output;
}

export type TemplateSummary<T extends readonly StageTemplate<any, any, any>[]> = {
  readonly stages: T['length'];
  readonly names: { [I in keyof T]: T[I]['kind'] };
};

export function summarizeTemplates<const T extends readonly StageTemplate<any, any, any>[]>
(specs: T): TemplateSummary<T> {
  return {
    stages: specs.length,
    names: specs.map((value) => value.kind) as { [I in keyof T]: T[I]['kind'] },
  } as TemplateSummary<T>;
}

export type MetricBucket = {
  readonly name: StageMetricsName<string>;
  readonly value: number;
};

export type WeightedMetric<T extends string> = {
  readonly [K in T as `metric.${K}`]: MetricBucket;
};

export function deriveMetrics<T extends readonly string[]>(
  ...names: T
): WeightedMetric<T[number]>[] {
  return names.map((name, index) => ({
    [`metric.${name}`]: {
      name: `${name}_p95` as StageMetricsName<string>,
      value: index * 1.25,
    },
  } as WeightedMetric<T[number]>));
}

export function normalizeTemplates<T extends readonly StageTemplate<any, any, any>[]>(
  templates: T,
): T {
  return ([...templates].sort((a, b) => a.kind.localeCompare(b.kind)) as unknown) as T;
}

export async function executeDryRun<TInput extends object, TOutput = TInput>(
  input: TInput,
  stages: readonly StageTemplate<TInput, TInput, TOutput>[],
  trace: ScenarioTrace,
): Promise<PipelineResult<readonly StageTemplate<TInput, TInput, TOutput>[], TOutput>> {
  const runtime = new ScenarioRuntime<TInput, TOutput>(trace);
  let cursor: TInput | TOutput = input;
  const frames: PipelineFrame<StageTemplate<TInput, TInput, TOutput>, TOutput>[] = [];

  for (const stage of stages[Symbol.iterator]()) {
    const frame: StageFrame<TInput, TOutput> = {
      index: runtime.history.length,
      startedAt: Date.now(),
      stageId: stage.id,
      input: input,
      status: 'warming',
    };
    runtime.record(frame);

    const result = await stage.adapter.transform(
      {
        scenarioId: input as never,
        runId: '' as ScenarioRunId,
        startedAt: frame.startedAt,
        input: cursor as TInput,
      },
      cursor,
      runtime.trace,
    );

    if (result.status === 'ok' && result.output !== undefined) {
      cursor = result.output;
    }

    frames.push({
      stage,
      output: cursor as TOutput,
      status: result.status === 'error' ? 'failed' : 'ok',
    });
  }

  return {
    status: 'done',
    frames,
  };
}
