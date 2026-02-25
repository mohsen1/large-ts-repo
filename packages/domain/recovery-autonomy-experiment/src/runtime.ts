import { type NoInfer } from '@shared/type-level';
import {
  ExperimentPlan,
  ExperimentPayload,
  ExperimentIntent,
  ExperimentContext,
  PHASE_SEQUENCE,
  ExperimentRunId,
  RuntimeEnvelope,
  RuntimeEvent,
  RuntimeResult,
  ExperimentPhase,
  RuntimeHandle,
} from './types';

type RuntimeInput<TPayload extends Record<string, unknown>> = {
  readonly envelope: RuntimeEnvelope<TPayload>;
  readonly input: NoInfer<TPayload>;
};

type RuntimeHook<TInput extends Record<string, unknown>, TOutput> = (ctx: {
  readonly phase: ExperimentPhase;
  readonly envelope: ExperimentPlan<TInput>;
  readonly request: ExperimentIntent;
  readonly context: ExperimentContext;
}) => Promise<TOutput>;

export interface RuntimeExecutor {
  readonly runId: ExperimentRunId;
  readonly phases: readonly ExperimentPhase[];
  execute<TInput extends Record<string, unknown>, TOutput>(
    config: RuntimeInput<TInput>,
    handler: RuntimeHook<TInput, TOutput>,
  ): Promise<RuntimeResult<TOutput>>;
}

export const collectOutputPayloads = <T>(items: readonly RuntimeEvent<T>[]): readonly T[] => items.map((item) => item.output);

export class ExperimentRuntime implements RuntimeExecutor, RuntimeHandle {
  readonly #events: RuntimeEvent[] = [];
  readonly #startAt = Date.now();
  #disposed = false;
  readonly phases = [...PHASE_SEQUENCE];

  constructor(readonly runId: ExperimentRunId) {}

  async execute<TInput extends Record<string, unknown>, TOutput>(
    config: RuntimeInput<TInput>,
    handler: RuntimeHook<TInput, TOutput>,
  ): Promise<RuntimeResult<TOutput>> {
    if (this.#disposed) {
      throw new Error('runtime disposed');
    }

    const outputs: RuntimeEvent<TOutput>[] = [];
    const sequenceProgress: number[] = [];

    for (const [index, phase] of config.envelope.plan.sequence.entries()) {
      const output = await handler({
        phase,
        envelope: config.envelope.plan,
        request: config.envelope.intent,
        context: config.envelope.context,
      });
      outputs.push({
        phase,
        output,
        recordedAt: new Date().toISOString(),
        runId: config.envelope.intent.runId,
      });
      sequenceProgress.push(index);
      if (phase === config.envelope.plan.sequence.at(-1)) {
        break;
      }
    }

    return {
      runId: config.envelope.intent.runId,
      outputs,
      state: {
        phase: config.envelope.plan.sequence.at(-1) ?? config.envelope.intent.phase,
        sequenceProgress,
        complete: true,
      },
    };
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    this.#events.length = 0;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    await Promise.resolve(this.#startAt);
  }
}

const traceSuffix = (seed: string): string => `${seed}:${Math.floor(performance.now())}`;

export const createRuntimeTrace = (parts: readonly string[]): readonly string[] =>
  parts.toSorted().map((part, index) => `${index}:${traceSuffix(part)}`);

export const createRuntime = (runId: ExperimentRunId): ExperimentRuntime => new ExperimentRuntime(runId);

export const toRuntimeEnvelope = <TMetadata extends Record<string, unknown>>(config: {
  plan: ExperimentPlan<TMetadata>;
  intent: ExperimentIntent;
  context: ExperimentContext;
  payload: ExperimentPayload<TMetadata>;
}): RuntimeEnvelope<TMetadata> => ({
  plan: config.plan,
  intent: config.intent,
  context: config.context,
  payload: config.payload,
});
