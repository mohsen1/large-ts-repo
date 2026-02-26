export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Branded<T, Tag extends string> = T & { readonly __brand: Tag };
export type SolverMode = 'analyze' | 'compile' | 'simulate' | 'plan' | 'rollback' | 'observe';
export type SolverTarget = `target:${string}`;
export type SolverPlan = `plan:${string}`;
export type SolverRoute = `/${string}/${string}/${string}`;
export type SolverPayload<TMode extends SolverMode, TTarget extends SolverTarget> = {
  readonly mode: TMode;
  readonly target: TTarget;
  readonly route: SolverRoute;
};

export type SolverConstraint<A extends string, B extends number, C extends boolean> = A extends string
  ? B extends number
    ? C extends boolean
      ? true
      : false
    : false
  : false;

export type SolverAccumulator<
  TInput,
  TAcc extends readonly unknown[] = [],
> = TInput extends readonly [infer Head, ...infer Tail]
  ? SolverAccumulator<Tail, readonly [...TAcc, Head]>
  : TAcc;

export interface SolverPlugin<TKind extends string = string> {
  kind: TKind;
  priority: Branded<number, 'priority'>;
  run(input: unknown): Promise<unknown>;
}

export interface SolverResult<TMode extends SolverMode = SolverMode> {
  mode: TMode;
  trace: ReadonlyArray<string>;
  payload: Branded<unknown, 'SolverPayload'>;
  output: Branded<unknown, 'SolverOutput'>;
}

export interface SolverSolver<TInput, TOutput, TMode extends SolverMode> {
  mode: TMode;
  parse(input: TInput): SolverPayload<TMode, SolverTarget>;
  solve(input: TInput): Promise<SolverResult<TMode>>;
  finalize(input: TOutput): TOutput;
}

export interface ConstraintGate<A, B, C> {
  a: A & Branded<A & string, 'A'>;
  b: B & Branded<B & number, 'B'>;
  c: C & Branded<C & boolean, 'C'>;
}

export type ResolveSolver<
  TInput,
  A extends string,
  B extends number,
  C extends boolean,
> = SolverConstraint<A, B, C> extends true
  ? ConstraintGate<A, B, C> & {
      readonly input: TInput;
      readonly signature: `${A}/${B}/${C extends true ? 'on' : 'off'}`;
    }
  : never;

export interface OverloadResult<T> {
  accepted: boolean;
  data: T;
}

export function solveOverload(input: { readonly mode: 'analyze'; readonly target: `target:${string}` }): OverloadResult<SolverResult<'analyze'>>;
export function solveOverload(input: { readonly mode: 'compile'; readonly target: `target:${string}`; readonly plan: SolverPlan }): OverloadResult<SolverResult<'compile'>>;
export function solveOverload(input: { readonly mode: 'simulate'; readonly target: `target:${string}`; readonly traces: ReadonlyArray<string> }): OverloadResult<SolverResult<'simulate'>>;
export function solveOverload(input: { readonly mode: 'plan'; readonly target: `target:${string}`; readonly strategy: Branded<string, 'Strategy'> }): OverloadResult<SolverResult<'plan'>>;
export function solveOverload(input: { readonly mode: 'rollback'; readonly target: `target:${string}`; readonly reason: string }): OverloadResult<SolverResult<'rollback'>>;
export function solveOverload(input: { readonly mode: 'observe'; readonly target: `target:${string}`; readonly stream: AsyncIterable<unknown> }): OverloadResult<SolverResult<'observe'>>;
export function solveOverload(
  input:
    | { readonly mode: Exclude<SolverMode, 'compile' | 'simulate' | 'plan' | 'rollback' | 'observe'>; readonly target: SolverTarget }
    | {
        readonly mode: 'compile' | 'simulate' | 'plan' | 'rollback' | 'observe';
        readonly target: SolverTarget;
        readonly plan?: SolverPlan;
        readonly traces?: ReadonlyArray<string>;
        readonly strategy?: Branded<string, 'Strategy'>;
        readonly reason?: string;
        readonly stream?: AsyncIterable<unknown>;
      },
): OverloadResult<SolverResult<SolverMode>> {
  switch (input.mode) {
    case 'analyze': {
      const payload = `analyze:${input.target}` as unknown as Branded<unknown, 'SolverPayload'>;
      return {
        accepted: true,
        data: {
          mode: 'analyze',
          trace: ['analyze:start', `target:${input.target}`],
          payload,
          output: 'analyze-output' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
    case 'compile': {
      return {
        accepted: true,
        data: {
          mode: 'compile',
          trace: ['compile:start', `plan:${input.mode === 'compile' ? input.plan : ''}`],
          payload: `compile:${input.target}` as unknown as Branded<unknown, 'SolverPayload'>,
          output: 'compile-output' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
    case 'simulate': {
      return {
        accepted: true,
        data: {
          mode: 'simulate',
          trace: ['simulate:start', `traces:${input.mode === 'simulate' ? (input.traces?.length ?? 0) : 0}`],
          payload: `simulate:${input.target}` as unknown as Branded<unknown, 'SolverPayload'>,
          output: 'simulate-output' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
    case 'plan': {
      return {
        accepted: true,
        data: {
          mode: 'plan',
          trace: ['plan:start', `strategy:${input.mode === 'plan' ? input.strategy : ''}`],
          payload: `plan:${input.target}` as unknown as Branded<unknown, 'SolverPayload'>,
          output: 'plan-output' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
    case 'rollback': {
      return {
        accepted: true,
        data: {
          mode: 'rollback',
          trace: ['rollback:start', `reason:${input.mode === 'rollback' ? input.reason : ''}`],
          payload: `rollback:${input.target}` as unknown as Branded<unknown, 'SolverPayload'>,
          output: 'rollback-output' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
    case 'observe': {
      return {
        accepted: true,
        data: {
          mode: 'observe',
          trace: ['observe:start', 'stream:active'],
          payload: `observe:${input.target}` as unknown as Branded<unknown, 'SolverPayload'>,
          output: 'observe-output' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
    default: {
      return {
        accepted: false,
        data: {
          mode: 'analyze',
          trace: ['fallback'],
          payload: 'fallback' as unknown as Branded<unknown, 'SolverPayload'>,
          output: 'fallback' as unknown as Branded<unknown, 'SolverOutput'>,
        },
      } as OverloadResult<SolverResult<SolverMode>>;
    }
  }
}

export const resolveMatrix = <
  A extends string,
  B extends number,
  C extends boolean,
  TInput,
>(
  mode: SolverMode,
  input: TInput,
  constraintA: NoInfer<A>,
  constraintB: NoInfer<B>,
  constraintC: NoInfer<C>,
): { readonly constraints: `${A}/${B}/${C extends true ? 'on' : 'off'}`; readonly input: TInput; readonly output: OverloadResult<SolverResult<SolverMode>> } => {
  const signature = `${String(constraintA)}:${String(constraintB)}:${String(constraintC)}` as `${A}/${B}/${C extends true ? 'on' : 'off'}`;
  const baseTarget = 'target:root' as SolverTarget;
  if (mode === 'analyze') {
    return {
      constraints: signature,
      input,
      output: solveOverload({ mode: 'analyze', target: baseTarget }),
    };
  }
  if (mode === 'compile') {
    return {
      constraints: signature,
      input,
      output: solveOverload({ mode: 'compile', target: baseTarget, plan: 'plan:alpha' as SolverPlan }),
    };
  }
  if (mode === 'simulate') {
    return {
      constraints: signature,
      input,
      output: solveOverload({ mode: 'simulate', target: baseTarget, traces: ['trace-a', 'trace-b'] }),
    };
  }
  if (mode === 'plan') {
    return {
      constraints: signature,
      input,
      output: solveOverload({ mode: 'plan', target: baseTarget, strategy: 'strategy-1' as Branded<string, 'Strategy'> }),
    };
  }
  if (mode === 'rollback') {
    return {
      constraints: signature,
      input,
      output: solveOverload({ mode: 'rollback', target: baseTarget, reason: 'manual' }),
    };
  }
  return {
    constraints: signature,
    input,
    output: solveOverload({
      mode: 'observe',
      target: baseTarget,
      stream: (async function* () {
        yield { ok: true };
      })(),
    }),
  };
};
