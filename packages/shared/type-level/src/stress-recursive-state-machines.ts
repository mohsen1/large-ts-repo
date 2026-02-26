type BuildStateTuple<N extends number, Out extends readonly { readonly depth: number }[] = []> =
  Out['length'] extends N
    ? Out
    : BuildStateTuple<N, [...Out, { readonly depth: Out['length'] }]>

type Decrement<N extends number> = N extends 0
  ? 0
  : BuildStateTuple<N> extends readonly [...infer Prefix, infer _]
    ? Prefix['length']
    : never;

type TupleToTrace<
  TState extends readonly { readonly depth: number }[],
  TAccum extends readonly string[] = [],
> = TState extends readonly [infer Head, ...infer Tail]
  ? Head extends { readonly depth: infer D }
    ? TupleToTrace<Tail & readonly { readonly depth: number }[], [...TAccum, `depth-${D & number}`]>
    : TAccum
  : TAccum;

export type BuildMachinePath<N extends number> = TupleToTrace<BuildStateTuple<N>>;

export type NormalizeMachineDepth<T extends number> = T extends 0
  ? 0
  : T extends 1
    ? 1
    : T extends 2
      ? 2
      : T extends 3
        ? 3
        : T extends 4
          ? 4
          : T extends 5
            ? 5
            : T extends 6
              ? 6
              : T extends 7
                ? 7
                : T extends 8
                  ? 8
                  : T extends 9
                    ? 9
                    : T extends 10
                      ? 10
                      : T extends 11
                        ? 11
                        : T extends 12
                          ? 12
                          : T extends 13
                            ? 13
                            : T extends 14
                              ? 14
                              : T extends 15
                                ? 15
                                : T extends 16
                                  ? 16
                                  : 17;

type TransitionAccum<N extends number, TAccum extends readonly string[] = []> = N extends 0
  ? [...TAccum, 'closed']
  : TransitionAccum<Decrement<N>, [...TAccum, `step-${N}`]>;

export type TransitionPlan<N extends number> = TransitionAccum<NormalizeMachineDepth<N>>;

export interface RecursiveMachineConfig {
  readonly mode: 'deterministic' | 'optimistic' | 'pessimistic';
  readonly iterations: number;
  readonly strict: boolean;
}

type RecursiveMachineInputInternal<N extends number, Config extends RecursiveMachineConfig> = N extends 0
  ? {
      readonly ready: true;
      readonly stage: 0;
      readonly config: Config;
    }
  : {
      readonly ready: false;
      readonly stage: N;
      readonly config: Config;
      readonly next: RecursiveMachineInputInternal<Decrement<N>, Config>;
    };

export type RecursiveMachineInput<
  N extends number,
  Config extends RecursiveMachineConfig,
> = RecursiveMachineInputInternal<N, Config>;

type MachineAccumulation<
  T,
  TAccum extends readonly string[] = [],
> = T extends { readonly ready: true; readonly stage: infer Stage }
  ? [...TAccum, `done-${Stage & number}`]
  : T extends { readonly ready: false; readonly stage: infer Stage; readonly next: infer Next }
    ? Next extends RecursiveMachineInput<number, RecursiveMachineConfig>
      ? MachineAccumulation<Next, [...TAccum, `stage-${Stage & number}`]>
      : [...TAccum, `stage-${Stage & number}`]
    : TAccum;

export type MachinePlan<N extends number, C extends RecursiveMachineConfig> = MachineAccumulation<
  RecursiveMachineInput<N, C>
>;

type ReciprocalTransitionTuple<
  A extends number,
  B extends number,
  Acc extends string[] = [],
> = A extends 0
  ? B extends 0
    ? [...Acc, `a${A}-b${B}`]
    : [...Acc, `a${A}-b${B}`]
  : B extends 0
    ? [...Acc, `a${A}-b${B}`]
    : ReciprocalTransitionTuple<Decrement<A>, Decrement<B>, [...Acc, `a${A}-b${B}`]>;

export interface MachineEnvelope {
  readonly domain: string;
  readonly transitions: readonly string[];
  readonly checksum: string;
}

export type BuildMachineEnvelope<N extends number> = {
  readonly domain: `machine-${N}`;
  readonly transitions: readonly string[];
  readonly checksum: `sum-${N}`;
};

const machineDepth = 16 as const;

const transitionRows = Array.from(
  { length: machineDepth },
  (_, index) => `a${machineDepth - index}-b${machineDepth - index}`,
) as readonly string[];

export const machineBlueprint = {
  domain: `machine-${machineDepth}`,
  transitions: transitionRows,
  checksum: `sum-${machineDepth}` as const,
} as const satisfies BuildMachineEnvelope<typeof machineDepth>;

export type ReciprocalTransition = ReciprocalTransitionTuple<16, 16>;
