import { fail, ok, type Result } from '@shared/result';
import type { NoInfer } from '@shared/type-level';
import type {
  ChaosScope,
  ChaosRunPhase,
  ConsoleWorkspace,
  ChaosRunRecord,
  ChaosRunId,
  ChaosSignalEnvelope,
  ChaosRunMode
} from './types';

export type StepTuple<T> = readonly [
  ...T extends readonly [unknown, ...unknown[]]
    ? T
    : readonly [T]
];

type AsyncResult<T> = Result<T> | Promise<Result<T>>;

export interface PipelineStep<TInput, TOutput> {
  readonly name: string;
  readonly scope: ChaosScope;
  readonly execute: (input: TInput) => AsyncResult<TOutput>;
}

export interface PipelineNode<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly phase: ChaosRunPhase;
  readonly input: TInput;
  readonly output: TOutput;
}

export type ChainState<
  TInput,
  TSteps extends readonly PipelineStep<any, any>[]
> = TSteps extends readonly [infer Head, ...infer Tail]
  ? Head extends PipelineStep<TInput, infer Next>
    ? ChainState<Next, Extract<Tail, readonly PipelineStep<any, any>[]>>
    : never
  : TInput;

export type PipelineOutput<TInput, TSteps extends readonly PipelineStep<TInput, any>[]> =
  TSteps extends readonly [infer Head, ...infer Tail]
    ? Head extends PipelineStep<TInput, infer TNext>
      ? PipelineOutput<TNext, Extract<Tail, readonly PipelineStep<TNext, any>[]>>
      : never
    : TInput;

export type PipelineTrace<T extends readonly PipelineStep<any, any>[]> = {
  readonly index: number;
  readonly name: string;
  readonly input: string;
  readonly output: string;
};

export class PipelineRunner<
  TInput,
  TSteps extends readonly PipelineStep<any, any>[]
> {
  readonly #steps: TSteps;

  constructor(steps: TSteps) {
    this.#steps = steps;
  }

  async run(seed: TInput): Promise<ChainState<TInput, TSteps>> {
    let current: unknown = seed;
    const next = [...this.#steps] as PipelineStep<unknown, unknown>[];

    for (const step of next) {
      const out = await step.execute(current);
      if (!out.ok) {
        throw out.error;
      }
      current = out.value;
    }

    return current as ChainState<TInput, TSteps>;
  }

  runSync(seed: TInput): Result<ChainState<TInput, TSteps>, Error> {
    try {
      let current: unknown = seed;
      for (const step of this.#steps) {
        const out = step.execute(current);
        const maybeAsync = typeof (out as PromiseLike<unknown>).then === 'function'
          ? true
          : false;

        if (maybeAsync) {
          return fail(new Error('pipeline step is async; use run() instead of runSync()')) as never;
        }

        const resolved = out as Result<unknown>;
        if (!resolved.ok) {
          return resolved.error ? fail(resolved.error) : fail(new Error('pipeline step failed')) as never;
        }
        current = resolved.value;
      }
      return ok(current as ChainState<TInput, TSteps>);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('pipeline failed')) as never;
    }
  }

  listTrace(): readonly PipelineTrace<TSteps>[] {
    return this.#steps.map((step, index) =>
      ({
        index,
        name: step.name,
        input: `/${step.scope}/${step.name}`,
        output: `/${step.scope}/${step.name}`
      }) as PipelineTrace<TSteps>
    );
  }
}

export function composePipeline<TInput, TSteps extends readonly PipelineStep<any, any>[] >(
  ...steps: TSteps
): PipelineRunner<TInput, TSteps> {
  return new PipelineRunner<TInput, TSteps>(steps);
}

export function chainSteps<TInput, TSteps extends readonly PipelineStep<any, any>[] >(
  ...steps: TSteps
): (input: TInput) => Promise<PipelineOutput<TInput, TSteps>> {
  const runner = composePipeline<TInput, TSteps>(...steps);
  return async (input: TInput) => runner.run(input) as Promise<PipelineOutput<TInput, TSteps>>;
}

export interface PlanDraft {
  readonly id: ChaosRunId;
  readonly title: string;
  readonly phases: readonly ChaosScope[];
  readonly mode: ChaosRunMode;
}

export interface WorkspacePlan<TPhases extends readonly ChaosScope[]> {
  readonly workspaceId: string;
  readonly planId: string;
  readonly mode: ChaosRunMode;
  readonly phases: TPhases;
  readonly windows: readonly {
    readonly phase: TPhases[number];
    readonly startMs: number;
    readonly durationMs: number;
  }[];
  readonly createdAt: number;
}

export type ExpandPhases<T extends readonly ChaosScope[], TAcc extends readonly { readonly phase: ChaosScope; readonly index: number }[] = []> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends ChaosScope
      ? ExpandPhases<Extract<Tail, readonly ChaosScope[]>, [...TAcc, { readonly phase: Head; readonly index: TAcc['length'] }]>
      : TAcc
    : TAcc;

export type PhaseIndex<T extends readonly ChaosScope[]> = ExpandPhases<T>[number];

export function buildWorkspacePlan<TPhases extends readonly ChaosScope[]>(
  draft: PlanDraft & { readonly phases: TPhases }
): WorkspacePlan<TPhases> {
  const windows = draft.phases.map((phase, index) => ({
    phase,
    startMs: index * 1000,
    durationMs: 500 + index * 50
  }));

  return {
    workspaceId: `workspace:${draft.id}`,
    planId: `plan:${draft.title}`,
    mode: draft.mode,
    phases: draft.phases,
    windows,
    createdAt: Date.now()
  };
}

export function partitionRunsByPhase<T extends readonly ChaosRunRecord[]>(
  runs: NoInfer<T>,
  phase: ChaosScope
): readonly T[number][] {
  const matches: T[number][] = [];
  for (const run of runs) {
    if (run.phase.split(':')[1] === phase) {
      matches.push(run);
    }
  }
  return matches as never;
}

export function scoreRunPlan<TWorkspace extends ConsoleWorkspace<
  Record<string, unknown>
>, TSignals extends readonly ChaosSignalEnvelope[]>(
  workspace: TWorkspace,
  signals: TSignals
): {
  readonly score: number;
  readonly labels: readonly string[];
} {
  const signalCount = signals.length;
  const runCount = workspace.runs.length;
  const labels = [...new Set(signals.map((signal) => signal.kind.split(':')[0]))];
  const score = runCount === 0 ? 0 : (Math.max(signalCount - runCount, 0) / (runCount || 1)) * 100;
  return {
    score,
    labels
  };
}
