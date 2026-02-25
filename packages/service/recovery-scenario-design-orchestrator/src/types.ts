import { Brand } from '@shared/type-level';
import { ScenarioId, ScenarioRunId, createScenarioId, createRunId } from '@domain/recovery-scenario-design';
import type { StagePayload, StageKind, StageTemplate, OrchestrationRunContext, ScenarioTrace } from '@domain/recovery-scenario-design';

export type ScenarioClock = bigint;

export interface ScenarioDesignInput<TContext = unknown> {
  readonly scenarioId: ScenarioId;
  readonly runId: ScenarioRunId;
  readonly initiatedBy: string;
  readonly correlationId: string;
  readonly context: TContext;
}

export interface ScenarioDesignOutput<TOutput = unknown> {
  readonly runId: ScenarioRunId;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly output?: TOutput;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

export interface ScenarioStepResult<TInput, TOutput> {
  readonly stageId: string;
  readonly kind: StageKind;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly metrics: StagePayload<Record<string, unknown>, TInput, TOutput>;
  readonly status: 'ok' | 'error' | 'skipped';
}

export interface ScenarioDesignEvent<
  TContext = unknown,
  TScenarioId extends ScenarioId = ScenarioId,
  TRunId extends ScenarioRunId = ScenarioRunId,
> {
  readonly type: 'scenario.started' | 'scenario.progress' | 'scenario.completed' | 'scenario.failed';
  readonly scenarioId: TScenarioId;
  readonly runId: TRunId;
  readonly timestamp: number;
  readonly payload: TContext;
}

export interface ScenarioRunnerConfig {
  readonly concurrency: number;
  readonly attemptLimit: number;
  readonly abortSignal?: AbortSignal;
  readonly emit?: (event: ScenarioDesignEvent) => void;
  readonly plugins?: readonly string[];
}

export interface ScenarioStageContext<TInput = unknown, TOutput = unknown> extends OrchestrationRunContext<TInput, TOutput> {
  readonly trace: ScenarioTrace;
  readonly startAt: number;
}

export type StageFactory<TInput, TOutput> = (
  input: TInput,
  context: ScenarioStageContext<TInput>,
) => Promise<TOutput>;

export interface StageAdapterResolver {
  readonly id: string;
  readonly supports: readonly StageKind[];
  readonly map: <TInput, TOutput>(
    input: TInput,
    context: ScenarioStageContext<TInput, TOutput>,
  ) => Promise<TOutput>;
}

export type RunResult<TOutput = unknown> = {
  readonly scenarioId: ScenarioId;
  readonly runId: ScenarioRunId;
  readonly output: TOutput;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly checkpoints: readonly string[];
};

export type StageOutputTuple<T extends readonly StageTemplate<unknown, unknown, unknown>[]> = {
  readonly [I in keyof T]: T[I] extends StageTemplate<unknown, infer _Input, infer O> ? {
    readonly status: 'ok' | 'failed';
    readonly output: O;
  } : never;
};

export interface ResolvePlan<T extends readonly StageTemplate<unknown, unknown, unknown>[]> {
  readonly chain: readonly T[number][];
  readonly inputFingerprint: Brand<string, 'input-fingerprint'>;
}

export const defaultDesignIds = {
  scenarioId: createScenarioId('recovery', 1),
  runId: createRunId('design', 100n),
};

export type Discovered<T> = {
  readonly value: T;
  readonly discoveredAt: number;
};

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type Clock = {
  now: () => number;
  toClock: () => ScenarioClock;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  toClock: () => BigInt(Date.now()),
};

export function resolveRunId(input: { scenarioId: ScenarioId; seed: number }): ScenarioRunId {
  return createRunId(input.scenarioId, BigInt(input.seed));
}

export function normalizePlan<T extends readonly StageTemplate<unknown, unknown, unknown>[]>(
  plan: T,
): ResolvePlan<T> {
  return {
    chain: [...plan],
    inputFingerprint: `fp:${plan.length}` as Brand<string, 'input-fingerprint'>,
  };
}
