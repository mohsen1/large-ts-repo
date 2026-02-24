import { runPipeline } from '@shared/type-level';
import type { AsyncReducer, NoInfer } from '@shared/type-level';
import {
  type MeshNodeContract,
  type MeshNodeConfig,
  type MeshPath,
  type MeshSignalKind,
  type MeshStepInput,
  type MeshOutcome,
  type MeshTupleConcat,
  type MeshTupleZip,
} from './types';

export type Invariant<T> = T & { readonly __brand: unique symbol };

export type MeshStage<I, O> = {
  readonly label: string;
  readonly run: (input: I) => Promise<O> | O;
};

export type AnyStage = MeshStage<unknown, unknown>;

export type StageInput<TStage> = TStage extends MeshStage<infer I, unknown> ? I : never;
export type StageOutput<TStage> = TStage extends MeshStage<infer _I, infer O> ? O : never;

export type ValidatePipeline<TStages extends readonly AnyStage[]> =
  TStages extends readonly [infer Head, ...infer Tail]
    ? Head extends AnyStage
      ? Tail extends readonly AnyStage[]
        ? Tail extends []
          ? true
          : StageOutput<Extract<Head, AnyStage>> extends StageInput<Extract<Tail[0], AnyStage>>
            ? ValidatePipeline<Tail extends readonly AnyStage[] ? Tail : never>
            : false
        : false
      : false
    : true;

export type BuildPipelineInput<TStages extends readonly AnyStage[]> =
  TStages extends readonly [infer Head, ...any]
    ? StageInput<Extract<Head, AnyStage>>
    : never;

export type BuildPipelineOutput<TStages extends readonly AnyStage[]> =
  TStages extends readonly [...any, infer Last]
    ? StageOutput<Extract<Last, AnyStage>>
    : never;

export type ComposeResult<TStages extends readonly AnyStage[]> =
  ValidatePipeline<TStages> extends true
    ? { ok: true; value: BuildPipelineOutput<TStages> }
    : { ok: false; reason: 'MISMATCHED_PIPELINE_TYPES' };

export type NextFn<I, TAcc> = (value: I) => TAcc;

export type MeshReducer<T extends readonly MeshStepInput<unknown>[], TAcc> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends MeshStepInput<unknown>
      ? Tail extends readonly MeshStepInput<unknown>[]
        ? NextFn<Head['payload'], TAcc> extends infer Next
          ? Next extends (...args: readonly any[]) => infer TResult
            ? (next: NextFn<Head['payload'], TAcc>) => MeshReducer<Tail, TResult>
            : never
          : never
        : never
      : TAcc
    : TAcc;

export type ExtractNodeMap<TNodes extends readonly MeshNodeContract[]> = {
  [T in TNodes[number] as T['id']]: T;
};

export type MapNodeIds<TNodes extends readonly MeshNodeConfig[]> = {
  [N in TNodes[number] as N['id'] extends string ? N['id'] : never]: N;
};

export interface MeshTopologyWalker<T extends readonly MeshNodeContract[]> {
  readonly walk: <TPath extends MeshPath>(path: NoInfer<TPath>) => T[number] | undefined;
  readonly has: (nodeId: T[number]['id']) => boolean;
  readonly pathKeys: () => readonly MeshPath[];
}

export type TTopologyPath = MeshPath;

export interface MeshPipelineContext<TContext> {
  readonly context: TContext;
  readonly steps: readonly AnyStage[];
  readonly metadata: {
    readonly createdAt: number;
    readonly signature: string;
  };
}

export const isComposeValid = <TStages extends readonly AnyStage[]>(
  stages: TStages,
): ComposeResult<TStages> => {
  if (stages.length < 2) {
    return {
      ok: false,
      reason: 'MISMATCHED_PIPELINE_TYPES',
    } as ComposeResult<TStages>;
  }

  for (let i = 0; i + 1 < stages.length; i += 1) {
    const current = stages[i];
    const next = stages[i + 1];
    if (!current || !next) {
      return {
        ok: false,
        reason: 'MISMATCHED_PIPELINE_TYPES',
      } as ComposeResult<TStages>;
    }
  }

  return {
    ok: true,
    value: undefined as BuildPipelineOutput<TStages>,
  } as ComposeResult<TStages>;
};

export const composeStages = <TStages extends readonly AnyStage[]>(
  stages: TStages,
): ComposeResult<TStages> => isComposeValid(stages);

export const composeStageExecution = <TInput, TOutput>(
  ...stages: readonly MeshStage<any, any>[]
): (input: TInput) => Promise<TOutput> => {
  const valid = composeStages(stages as readonly AnyStage[]);
  if (!valid.ok) {
    throw new Error('MISMATCHED_PIPELINE_TYPES');
  }

  return async (input: TInput): Promise<TOutput> => {
    let current: unknown = input;
    for (const stage of stages) {
      current = await stage.run(current);
    }
    return current as TOutput;
  };
};

export const mergeOutcomes = <T extends readonly MeshOutcome<MeshSignalKind, unknown>[]>(
  outcomes: T,
): ResultMap<T> => {
  const out = new Map<MeshSignalKind, unknown[]>();
  for (const outcome of outcomes) {
    const bucket = out.get(outcome.kind) ?? [];
    bucket.push(outcome.value);
    out.set(outcome.kind, bucket);
  }

  return {
    signals: Object.fromEntries(out) as Record<MeshSignalKind, unknown[]>,
    total: outcomes.length,
  };
};

type ResultMap<T extends readonly MeshOutcome<MeshSignalKind, unknown>[]> = {
  readonly signals: {
    pulse: unknown[];
    snapshot: unknown[];
    alert: unknown[];
    telemetry: unknown[];
  };
  readonly total: T['length'];
};

export type NodeRoute<TLeft extends readonly MeshStepInput<unknown>[], TRight extends readonly MeshStepInput<unknown>[]> =
  MeshTupleZip<TLeft, TRight>;

export type NodeFold<T extends readonly MeshStepInput<unknown>[], TSeed, TAcc = unknown> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends MeshStepInput<infer H>
      ? (step: (seed: TSeed, value: H, index: number) => TSeed, seed: TSeed, index?: number) =>
          NodeFold<Tail extends readonly MeshStepInput<unknown>[] ? Tail : never, TSeed, TSeed>
      : never
    : TSeed;

export const foldSteps = <TInput, TSeed>(
  steps: readonly MeshStepInput<TInput>[],
  reducer: AsyncReducer<MeshStepInput<TInput>, TSeed>,
  seed: TSeed,
): Promise<TSeed> => {
  return runPipeline(
    'mesh-fold',
    [
      async (state: TSeed): Promise<TSeed> => {
        let current = state;
        for (const [index, item] of steps.entries()) {
          current = await reducer(current, item, index);
        }
        return current;
      },
    ],
    seed,
  );
};

export interface MeshTopologyNavigator<TNodes extends readonly MeshNodeContract[]> {
  readonly nodes: TNodes;
  readonly toPath: (path: MeshPath) => MeshNodeContract | undefined;
  readonly toNode: (nodeId: MeshNodeContract['id']) => MeshNodeContract | undefined;
}

export const createNavigator = <TNodes extends readonly MeshNodeContract[]>(
  nodes: NoInfer<TNodes>,
): MeshTopologyNavigator<TNodes> => {
  const map = new Map<MeshNodeContract['id'], MeshNodeContract>(nodes.map((node) => [node.id, node]));

  return {
    nodes,
    toPath(path) {
      return map.get(path as MeshNodeContract['id']);
    },
    toNode(nodeId) {
      return map.get(nodeId);
    },
  };
};

export const flattenStageSequence = <T extends readonly AnyStage[]>(
  ...stages: T
): MeshTupleConcat<T, []> => stages as MeshTupleConcat<T, []>;

export interface PipelineSummary<TStages extends readonly AnyStage[]> {
  readonly stages: TStages;
  readonly valid: ComposeResult<TStages>;
  readonly inputType: BuildPipelineInput<TStages>;
  readonly outputType: BuildPipelineOutput<TStages>;
}

export const describePipeline = <TStages extends readonly AnyStage[]>(
  stages: TStages,
): PipelineSummary<TStages> => {
  const valid = composeStages(stages);
  return {
    stages,
    valid,
    inputType: undefined as BuildPipelineInput<TStages>,
    outputType: undefined as BuildPipelineOutput<TStages>,
  };
};
