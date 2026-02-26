import type { Brand } from './patterns';

export type BuildLengthTuple<
  T extends number,
  TAcc extends readonly unknown[] = [],
> = TAcc['length'] extends T ? TAcc : BuildLengthTuple<T, [...TAcc, unknown]>;

export type Dec<T extends number> = BuildLengthTuple<T> extends readonly [infer _Head, ...infer Tail] ? Tail['length'] : never;

export type AddOne<T extends number> = BuildLengthTuple<T> extends infer Acc extends readonly unknown[]
  ? [...Acc, unknown]['length']
  : never;

export type Subtract<A extends number, B extends number> = BuildLengthTuple<A> extends [...(infer Left), ...BuildLengthTuple<B>]
  ? Left['length']
  : never;

export type BuildTupleUnion<T extends number, TAcc extends readonly unknown[] = []> = TAcc['length'] extends T
  ? TAcc[number]
  : BuildTupleUnion<T, [...TAcc, TAcc['length']]>;

export type NumericLiteralTuple<T extends number, TSeed extends readonly unknown[] = []> = TSeed['length'] extends T
  ? TSeed
  : NumericLiteralTuple<T, [...TSeed, TSeed['length']]>;

export type SumTuples<A extends readonly unknown[], B extends readonly unknown[]> = [...A, ...B]['length'];
export type MultiplyTuples<A extends number, B extends number> = SumTuples<NumericLiteralTuple<A>, NumericLiteralTuple<B>> extends infer R
  ? R & number
  : never;

export type FibonacciLike<T extends number, A extends number = 0, B extends number = 1> = T extends 0
  ? A
  : T extends 1
    ? B
    : FibonacciLike<Subtract<T, 1>, B, AddOne<A> | AddOne<B>>;

export type NestedTuple<T extends unknown[], Depth extends number> = Depth extends 0
  ? T
  : {
      readonly [I in keyof T]: T[I] extends object ? NestedTuple<[T[I]], Dec<Depth>> : [T[I], ...NestedTuple<[T[I]], Dec<Depth>>];
    };

export type RecursiveAccum<T extends string, N extends number, Acc extends readonly string[] = []> = N extends 0
  ? readonly [...Acc, T]
  : RecursiveAccum<`[${N}]${T}`, Dec<N>, [...Acc, T]>;

export type NormalizePath<T extends string, N extends number> = N extends 0
  ? T
  : NormalizePath<`${T}:${N}`, Dec<N>>;

export type ExpandWorkflow<T extends string, N extends number> = RecursiveAccum<T, N>;

export type AccumulateWorkflow<T extends string, N extends number> = N extends 0
  ? {
      readonly summary: `${T}:0`;
      readonly path: readonly [T];
      readonly depth: N;
    }
  : {
      readonly summary: `${T}:${N}`;
      readonly path: ExpandWorkflow<T, N>;
      readonly depth: N;
    };

export type IsEven<T extends number> = T extends 0 ? true : T extends 1 ? false : IsEven<Subtract<T, 2>>;
export type IsOdd<T extends number> = T extends 0 ? false : T extends 1 ? true : IsOdd<Subtract<T, 2>>;

export type WorkflowNode<TName extends string, TDepth extends number> = {
  readonly name: TName;
  readonly depth: TDepth;
  readonly odd: IsOdd<TDepth>;
  readonly even: IsEven<TDepth>;
  readonly next: TDepth extends 0 ? never : WorkflowNode<TName, Dec<TDepth>>;
};

export type WorkflowMap<T extends ReadonlyArray<string>> = {
  [K in keyof T]: WorkflowNode<T[K] & string, 4>;
};

export type WorkflowGraph<TCommands extends readonly string[]> = {
  readonly profile: Record<string, WorkflowNode<string, 4>>;
  readonly chain: {
    readonly [K in TCommands[number]]: RecursionNode<K & string>;
  };
  readonly checksum: BuildChecksum<TCommands>;
};

export type RecursionNode<T extends string> = {
  readonly seed: T;
  readonly branches: readonly [T, T, ...T[]];
  readonly steps: NumericLiteralTuple<3>;
};

export type BuildChecksum<T extends ReadonlyArray<string>> = T extends readonly [infer A, ...infer Rest]
  ? Rest['length'] extends 0
    ? `${A & string}-${Rest['length']}`
    : `${A & string}|${BuildChecksum<Extract<Rest, string[]>>}`
  : never;

export type MutuallyRecursiveA<T extends string, Depth extends number> = Depth extends 0
  ? { readonly step: T; readonly next: never; readonly phase: 'done' }
  : {
      readonly step: T;
      readonly next: MutuallyRecursiveB<T, Dec<Depth>>;
      readonly phase: 'forward';
    };

export type MutuallyRecursiveB<T extends string, Depth extends number> = Depth extends 0
  ? { readonly step: T; readonly next: never; readonly phase: 'done' }
  : {
      readonly step: T;
      readonly next: MutuallyRecursiveA<T, Dec<Depth>>;
      readonly phase: 'back';
    };

export type PipelineState<T extends string, Depth extends number> = MutuallyRecursiveA<T, Depth> | MutuallyRecursiveB<T, Depth>;

export type RouteId<T extends string> = Brand<T, 'RouteId'>;

export type SolverTuple<T extends string, N extends number> = N extends 0
  ? readonly [RouteId<T>]
  : readonly [RouteId<T>, ...SolverTuple<T, Dec<N>>];

export type DeepSolverPayload<T extends string, N extends number> = N extends 0
  ? {
      readonly route: RouteId<T>;
      readonly next: never;
      readonly checksum: `${T}-${N}`;
    }
  : {
      readonly route: RouteId<T>;
      readonly next: DeepSolverPayload<T, Dec<N>>;
      readonly checksum: `${T}-${N}`;
      readonly nested: SolverTuple<T, 3>;
    };

export const parseRoute = (value: string) => {
  const [verb, entity, severity, id] = value.split(':');
  return {
    verb: verb ?? '',
    entity: entity ?? '',
    severity: severity ?? '',
    id: id ?? '',
    tag: `${verb}-${entity}-${severity}`,
  };
};

export const normalizeWorkflow = <T extends string, N extends number>(value: T, depth: N): AccumulateWorkflow<T, N> => {
  const rows: string[] = [];
  for (let index = depth as number; index >= 0; index -= 1) {
    rows.push(`${value}:${index}`);
    if (index % 2 === 0) {
      rows.push(`${value}:even:${index}`);
    } else {
      rows.push(`${value}:odd:${index}`);
    }
  }
  return {
    summary: `${value}:${rows.length}` as `${T}:${number}`,
    path: rows as unknown as ExpandWorkflow<T, N>,
    depth: rows.length as N,
  } as unknown as AccumulateWorkflow<T, N>;
};

export const pipelineCatalog = ['discover:agent:low:id-1', 'ingest:mesh:medium:id-2', 'materialize:policy:high:id-3', 'simulate:incident:critical:id-4'] as const;

export type PipelineProfile = WorkflowGraph<typeof pipelineCatalog>;

export const buildPipeline = () => {
  const profile = pipelineCatalog.reduce((acc, command) => {
    acc[command] = {
      name: command,
      depth: 4,
      odd: false,
      even: true,
      next: {
        name: command,
        depth: 3,
        odd: true,
        even: false,
        next: {
          name: command,
          depth: 2,
          odd: false,
          even: true,
          next: {
            name: command,
            depth: 1,
            odd: true,
            even: false,
            next: {
              name: command,
              depth: 0,
              odd: false,
              even: true,
              next: null as unknown as never,
            },
          },
        },
      },
    };
    return acc;
  }, {} as Record<string, WorkflowNode<string, 4>>);

  const chain = pipelineCatalog.reduce((acc, command) => {
    acc[command] = {
      seed: command,
      branches: [command, command, command],
      steps: [0, 1, 2],
    };
    return acc;
  }, {} as Record<string, RecursionNode<string>>);

  const checksum = pipelineCatalog.reduce((acc, value, index) => `${acc}${index > 0 ? '|' : ''}${value}`, '');

  const workflow: PipelineProfile = {
    profile,
    chain,
    checksum,
  } as PipelineProfile;

  const recursive = pipelineCatalog.map((command) => parseRoute(command));
  return {
    workflow,
    recursive,
    solve: (seed: string, depth: number) => normalizeWorkflow(seed, depth),
    solveMutual: <T extends string, N extends number>(seed: T, depth: N): PipelineState<T, N> => {
      if (depth <= 0) {
        return {
          step: seed,
          next: null as unknown as never,
          phase: 'done',
        } as PipelineState<T, N>;
      }
      return {
        step: seed,
        next: {
              step: seed,
              next: {
                step: seed,
                next: {
                  step: seed,
                  next: null as unknown as never,
                  phase: 'done',
                },
                phase: 'done',
              },
          phase: 'done',
        },
        phase: 'forward',
      } as PipelineState<T, N>;
    },
  };
};
