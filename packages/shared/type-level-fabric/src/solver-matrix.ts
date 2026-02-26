export type NoInfer<T> = [T][T extends any ? 0 : never];

export type SolverDomain =
  | 'governance'
  | 'policy'
  | 'mesh'
  | 'runner'
  | 'control'
  | 'intelligence'
  | 'orchestration'
  | 'workload'
  | 'continuity'
  | 'risk';

export type SolverVerb =
  | 'plan'
  | 'execute'
  | 'observe'
  | 'recover'
  | 'drill'
  | 'reconcile'
  | 'inspect'
  | 'simulate'
  | 'teleport'
  | 'throttle'
  | 'stabilize';

export type SolverMode =
  | 'analyze'
  | 'synthesize'
  | 'enforce'
  | 'evict'
  | 'verify'
  | 'mutate'
  | 'simulate'
  | 'observe';

export type SolverState = 'idle' | 'queued' | 'running' | 'held' | 'succeeded' | 'failed' | 'cancelled';

export interface SolverInput<K extends string = string, V extends SolverDomain = SolverDomain, T extends SolverVerb = SolverVerb> {
  readonly key: K;
  readonly domain: V;
  readonly verb: T;
  readonly payload: unknown;
}

export type SolverSeed = Readonly<{
  readonly domain: SolverDomain;
  readonly verb: SolverVerb;
  readonly mode: SolverMode;
  readonly sequence: readonly SolverInput[];
}>;

export type BrandedContractId<T extends string> = T & { readonly __brand: 'contract-id' };

export type SolverModeByVerb<TVerb extends SolverVerb> =
  TVerb extends 'plan' | 'simulate'
    ? 'analyze'
    : TVerb extends 'execute' | 'recover' | 'drill'
      ? 'synthesize'
      : TVerb extends 'observe' | 'inspect'
        ? 'observe'
        : TVerb extends 'throttle'
          ? 'enforce'
          : TVerb extends 'reconcile'
            ? 'verify'
            : TVerb extends 'teleport'
              ? 'mutate'
              : 'simulate';

export type SolverContract<A extends SolverDomain, B extends SolverMode, C extends SolverInput> = {
  readonly policy: `contract:${A}:${B}`;
  readonly input: C;
};

export interface SolverConstraintShape {
  readonly mode: SolverMode;
  readonly guard: SolverDomain;
}

export type ConstraintChain<TInput extends SolverInput> = TInput extends {
  readonly domain: infer TDomain;
  readonly verb: infer TVerb;
}
  ? TDomain extends SolverDomain
    ? TVerb extends SolverVerb
      ? SolverContract<
          TDomain,
          SolverModeByVerb<TVerb>,
          Omit<TInput, 'mode' | 'guard'> & {
            readonly mode: SolverModeByVerb<TVerb>;
            readonly guard: TDomain;
          }
        >
      : never
    : never
  : never;

export type InterlockedContract<
  A extends string,
  B extends SolverDomain,
  C extends SolverMode,
  T = SolverSeed,
> = {
  readonly id: BrandedContractId<A>;
  readonly channel: `locked:${A}:${B}:${C}`;
  readonly state: SolverState;
  readonly source: T;
};

export type SolverConstraintResolver<TInput extends SolverInput> = {
  readonly contract: ConstraintChain<TInput>;
  readonly locked: InterlockedContract<'solver', TInput['domain'], SolverModeByVerb<TInput['verb'] & SolverVerb>>;
  readonly constraints: {
    readonly domainConstraint: boolean;
    readonly modeConstraint: boolean;
    readonly verbConstraint: boolean;
  };
};

export type SolveMatrix<T extends readonly SolverInput[]> = {
  readonly [K in keyof T]: T[K] extends SolverInput ? SolverConstraintResolver<T[K]> : never;
};

export type BrandedResolver = {
  readonly phase: 'resolve';
  readonly timestamp: number;
};

export interface ResolverState<T extends BrandedResolver = BrandedResolver> {
  readonly history: readonly T[];
  readonly checksum: `resolver:${number}`;
}

export interface ConstraintSolver<T extends SolverInput = SolverInput> {
  readonly id: BrandedContractId<'solver'>;
  readonly mode: SolverMode;
  readonly constraints: SolverConstraintResolver<T>;
  run(input: T): ResolverState<BrandedResolver>;
}

export interface ConstraintSolverEngine<
  TState extends SolverState = SolverState,
  TInput extends SolverInput = SolverInput,
> {
  readonly state: TState;
  readonly solver: ConstraintSolver<TInput>;
  configure<TMode extends SolverMode>(mode: TMode): ConstraintSolverEngine<TState, TInput & { readonly mode: TMode }>;
  execute(input: TInput): ResolverState;
}

export class ConstraintSolverHarness<TInput extends SolverInput = SolverInput>
  implements ConstraintSolverEngine<'running', TInput>
{
  readonly #id: BrandedContractId<'solver'>;
  readonly #history: BrandedResolver[] = [];

  constructor(readonly state: 'running', readonly mode: SolverMode, readonly tag: string) {
    this.#id = `solver:${tag}` as BrandedContractId<'solver'>;
  }

  private modeForVerb(verb: SolverVerb): SolverMode {
    const modeByVerb: { [V in SolverVerb]: SolverModeByVerb<V> } = {
      plan: 'analyze',
      simulate: 'analyze',
      execute: 'synthesize',
      recover: 'synthesize',
      drill: 'synthesize',
      reconcile: 'verify',
      observe: 'observe',
      inspect: 'observe',
      teleport: 'mutate',
      throttle: 'enforce',
      stabilize: 'simulate',
    };

    return modeByVerb[verb];
  }

  get solver(): ConstraintSolver<TInput> {
    const modeSeed = this.mode;
    const sample: SolverInput = {
      key: 'governance:seed',
      domain: 'governance',
      verb: 'plan',
      payload: {},
    };

    const typedSample = sample as SolverInput & {
      readonly mode: SolverModeByVerb<'plan'>;
      readonly guard: 'governance';
    };

    const solver = {
      id: this.#id,
      mode: modeSeed,
      constraints: {
        contract: {
          policy: `contract:${'governance'}:${this.modeForVerb('plan')}`,
          input: {
            ...typedSample,
            mode: modeSeed,
            guard: 'governance',
          },
        },
        locked: {
          id: `solver` as BrandedContractId<'solver'>,
          channel: `locked:solver:governance:${modeSeed}` as `locked:solver:governance:${SolverMode}`,
          state: 'running',
          source: {
            domain: 'governance',
            verb: 'plan',
            mode: modeSeed,
            sequence: [],
          } as SolverSeed,
        },
        constraints: {
          domainConstraint: true,
          modeConstraint: true,
          verbConstraint: true,
        },
      },
      run: (input: TInput) => {
        this.#history.push({
          phase: 'resolve',
          timestamp: this.computeSignal(input),
        });
        return {
          history: [...this.#history],
          checksum: `resolver:${this.#history.length}`,
        };
      },
    };

    return solver as unknown as ConstraintSolver<TInput>;
  }

  configure<TMode extends SolverMode>(nextMode: TMode): ConstraintSolverEngine<'running', TInput & { readonly mode: TMode }> {
    this.#history.push({
      phase: 'resolve',
      timestamp: Date.now(),
    });
    return {
      state: 'running',
      solver: this.solver as ConstraintSolver<TInput & { readonly mode: TMode }>,
      configure: (mode) => this.configure(mode),
      execute: (input) => this.execute(input),
    };
  }

  execute(input: TInput): ResolverState {
    this.#history.push({
      phase: 'resolve',
      timestamp: this.computeSignal(input),
    });
    return {
      history: [...this.#history],
      checksum: `resolver:${this.#history.length}`,
    } as ResolverState;
  }

  private computeSignal(input: TInput): number {
    return (input.key.length + input.domain.length + input.verb.length) % 17;
  }
}

export const makeSolverChain = (inputs: readonly SolverInput[]): {
  readonly matrix: SolveMatrix<typeof inputs>;
  readonly first: ConstraintSolverEngine<'idle', SolverInput>;
} => {
    const first = {
      state: 'idle' as const,
      solver: {
        id: 'solver:root' as BrandedContractId<'solver'>,
      mode: resolveModeFromVerb(inputs[0]?.verb ?? 'plan'),
      constraints: {
        contract: {
          policy: `contract:${inputs[0]?.domain ?? 'governance'}:${resolveModeFromVerb(inputs[0]?.verb ?? 'plan')}` as const,
          input: {
            key: inputs[0]?.key ?? 'root',
            domain: inputs[0]?.domain ?? 'governance',
            verb: inputs[0]?.verb ?? 'plan',
            payload: inputs[0]?.payload,
            mode: resolveModeFromVerb(inputs[0]?.verb ?? 'plan'),
            guard: inputs[0]?.domain ?? 'governance',
          },
        },
        locked: {
          id: 'solver' as BrandedContractId<'solver'>,
          channel: `locked:solver:${inputs[0]?.domain ?? 'governance'}:${resolveModeFromVerb(inputs[0]?.verb ?? 'plan')}` as `locked:${string}:${SolverDomain}:${SolverMode}`,
          state: 'idle',
          source: {
            domain: inputs[0]?.domain ?? 'governance',
            verb: inputs[0]?.verb ?? 'plan',
            mode: resolveModeFromVerb(inputs[0]?.verb ?? 'plan'),
            sequence: [...inputs],
          } as SolverSeed,
        },
        constraints: {
          domainConstraint: true,
          modeConstraint: true,
          verbConstraint: true,
        },
      },
      run: () => ({
        history: [],
        checksum: 'resolver:0',
      }),
    } as unknown as ConstraintSolver<SolverInput>,
    configure: () => first,
    execute: () => ({
      history: [],
      checksum: 'resolver:1',
    }),
  } as ConstraintSolverEngine<'idle', SolverInput>;

  return {
    matrix: [] as SolveMatrix<typeof inputs>,
    first,
  };
};

export function runSolverMatrix<T extends readonly SolverInput[]>(inputs: T): SolveMatrix<T>;
export function runSolverMatrix<T extends readonly SolverInput[]>(inputs: T, mode: 'strict'): SolveMatrix<T>;
export function runSolverMatrix<T extends readonly SolverInput[]>(inputs: T, _mode?: 'strict' | 'report'): SolveMatrix<T> {
  const catalog = [...inputs].sort((a, b) => a.key.localeCompare(b.key));
  const chain = makeSolverChain(catalog);
  void chain;
  return catalog.map((input) =>
    buildSolverContract(input.key, input.domain, input.verb),
  ) as unknown as SolveMatrix<T>;
}

export type OverloadedSolveResult<T extends SolverInput> =
  T extends { verb: 'plan' }
    ? { readonly phase: 'planning'; readonly payload: T }
    : T extends { verb: 'execute' }
      ? { readonly phase: 'execution'; readonly payload: T }
      : T extends { verb: 'observe' }
        ? { readonly phase: 'observation'; readonly payload: T }
        : T extends { verb: 'recover' }
          ? { readonly phase: 'recovery'; readonly payload: T }
          : { readonly phase: 'generic'; readonly payload: T };

export type VariadicConstraint<T extends ReadonlyArray<SolverInput>> =
  T extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly SolverInput[]
      ? Head extends SolverInput
        ? [OverloadedSolveResult<Head>, ...VariadicConstraint<Tail>]
        : []
      : []
    : [];

export const solveBatch = <TInputs extends readonly SolverInput[]>(...inputs: TInputs): VariadicConstraint<TInputs> => {
  return inputs.map((input) => {
    const phase =
      input.verb === 'plan'
        ? ('planning' as const)
        : input.verb === 'execute'
          ? ('execution' as const)
          : input.verb === 'observe'
            ? ('observation' as const)
            : input.verb === 'recover'
              ? ('recovery' as const)
              : ('generic' as const);

    return {
      phase,
      payload: input,
    };
  }) as VariadicConstraint<TInputs>;
};

export const solveWithSeed = <
  TSeed extends SolverSeed,
  TExact extends NoInfer<SolverInput>,
>(seed: TSeed, input: TExact) => {
  return {
    seed,
    input,
    constraints: {
      contract: {
        policy: `contract:${seed.domain}:${resolveModeFromVerb(seed.verb)}` as `contract:${SolverDomain}:${SolverMode}`,
        input: {
          ...input,
          mode: resolveModeFromVerb(seed.verb),
          guard: seed.domain,
        },
      },
      locked: {
        id: `solver` as BrandedContractId<'solver'>,
        channel: `locked:solver:${seed.domain}:${resolveModeFromVerb(seed.verb)}`,
        state: seed.verb === 'plan' ? 'queued' : 'running',
        source: seed,
      },
      constraints: {
        domainConstraint: true,
        modeConstraint: true,
        verbConstraint: true,
      },
    } as unknown as SolverConstraintResolver<TExact>,
  };
};

export const solverProfileGuard = (value: unknown): value is SolverConstraintResolver<SolverInput> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'contract' in value &&
    'locked' in value &&
    'constraints' in value
  );
};

export const buildSolverContract = <
  T extends string,
  TDomain extends SolverDomain,
  TVerb extends SolverVerb,
>(key: T, domain: TDomain, verb: TVerb): ConstraintChain<SolverInput<T, TDomain, TVerb>> => {
  const mode = resolveModeFromVerb(verb);
  const contract = {
    policy: `contract:${domain}:${mode}`,
    input: {
      key,
      domain,
      verb,
      payload: {},
      mode,
      guard: domain,
    },
  } as ConstraintChain<SolverInput<T, TDomain, TVerb>>;

  return contract;
};

const resolveModeFromVerb = (verb: SolverVerb): SolverMode => {
  const map: Record<SolverVerb, SolverMode> = {
    plan: 'analyze',
    simulate: 'analyze',
    execute: 'synthesize',
    recover: 'synthesize',
    drill: 'synthesize',
    reconcile: 'verify',
    inspect: 'observe',
    observe: 'observe',
    teleport: 'mutate',
    throttle: 'enforce',
    stabilize: 'simulate',
  };

  return map[verb];
};
