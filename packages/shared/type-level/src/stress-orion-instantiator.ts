import type { ConstraintUnion, ConstraintInput } from './stress-orion-constraints';

export type OrbiEntity =
  | 'incident'
  | 'workflow'
  | 'fabric'
  | 'policy'
  | 'telemetry'
  | 'safety'
  | 'risk';

export type OrbiVerb =
  | 'compose'
  | 'simulate'
  | 'verify'
  | 'reconcile'
  | 'observe'
  | 'drill'
  | 'dispatch'
  | 'archive';

export type OrbiCommand = `/${OrbiEntity}/${OrbiVerb}/${string}`;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type SolverResult<TState extends string, TCode extends string, TPayload> = {
  readonly state: TState;
  readonly code: TCode;
  readonly payload: TPayload;
  readonly checksum: `${TState}-${TCode}`;
};

export type SolverInput<TState extends OrbiEntity, TVerb extends OrbiVerb, TTag extends string> = {
  readonly state: TState;
  readonly verb: TVerb;
  readonly tag: TTag;
  readonly metadata: {
    readonly tag: TTag;
    readonly createdAt: number;
  };
};

export type ResolveSolver<TInput extends SolverInput<OrbiEntity, OrbiVerb, string>> =
  TInput['verb'] extends 'compose'
    ? SolverResult<TInput['state'], 'compose', TInput['metadata']>
    : TInput['verb'] extends 'simulate'
      ? SolverResult<TInput['state'], 'simulate', TInput['metadata'] & { readonly simulation: true }>
      : TInput['verb'] extends 'verify'
        ? SolverResult<TInput['state'], 'verify', TInput['metadata'] & { readonly verified: true }>
        : TInput['verb'] extends 'reconcile'
          ? SolverResult<TInput['state'], 'reconcile', TInput['metadata'] & { readonly reconciled: true }>
          : TInput['verb'] extends 'observe'
            ? SolverResult<TInput['state'], 'observe', TInput['metadata'] & { readonly observed: true }>
            : SolverResult<TInput['state'], 'general', TInput['metadata']>;

export type SolverMatrix<T extends readonly OrbiCommand[], TAcc extends readonly SolverResult<OrbiEntity, string, unknown>[] = []> =
  T extends readonly [infer Head, ...infer Rest]
    ? Head extends OrbiCommand
      ? Rest extends readonly OrbiCommand[]
        ? SolverMatrix<Rest, [...TAcc, ResolveSolver<ParseCommand<Head>>]>
        : TAcc
      : TAcc
    : TAcc;

export type ParseCommand<TCommand extends OrbiCommand> = TCommand extends `/${infer TState}/${infer TVerb}/${infer TTag}`
  ? TState extends OrbiEntity
    ? TVerb extends OrbiVerb
      ? SolverInput<TState, TVerb, TTag>
      : never
    : never
  : never;

export type BuildRouteUnion<T extends string, Acc extends readonly string[] = []> = Acc['length'] extends 16
  ? Acc[number]
  : BuildRouteUnion<T, [...Acc, `${T}/r${Acc['length']}`]>;

export type SolverPlan<TState extends OrbiEntity> = {
  readonly state: TState;
  readonly commands: readonly OrbiCommand[];
  readonly results: SolverMatrix<readonly OrbiCommand[]>;
};

export type SolverMap<T extends readonly OrbiCommand[]> = {
  [K in keyof T]: ParseCommand<T[K] & OrbiCommand>;
};

export type HigherOrderSolver<
  TInput extends OrbiCommand,
  TConfig extends { readonly mode: 'strict' | 'relaxed'; readonly fallback: boolean } = {
    mode: 'strict';
    fallback: false;
  },
> = (input: NoInfer<TInput>) => {
  readonly parsed: ParseCommand<TInput>;
  readonly mode: TConfig['mode'];
  readonly output: ResolveSolver<ParseCommand<TInput>>;
};

export interface SolverFactory<TState extends OrbiEntity = OrbiEntity, TMode extends 'strict' | 'relaxed' = 'strict'> {
  readonly domain: TState;
  readonly mode: TMode;
  create<TVerb extends OrbiVerb>(verb: TVerb): <TTag extends string>(
    tag: TTag,
    value: TMode extends 'strict'
      ? SolverInput<TState, TVerb, TTag>
      : SolverInput<OrbiEntity, OrbiVerb, string> | ConstraintUnion,
  ) => ResolveSolver<SolverInput<TState, TVerb, TTag>>;
}

export type Noop = {
  readonly tag: string;
};

export const createSolverFactory = <
  TState extends OrbiEntity,
  TMode extends 'strict' | 'relaxed' = 'strict',
>(state: TState, mode: TMode): SolverFactory<TState, TMode> => {
  const create = <TVerb extends OrbiVerb>(verb: TVerb) => {
    return <TTag extends string>(
      tag: TTag,
      value: TMode extends 'strict'
        ? SolverInput<TState, TVerb, TTag>
        : SolverInput<OrbiEntity, OrbiVerb, string> | ConstraintUnion,
    ): ResolveSolver<SolverInput<TState, TVerb, TTag>> => {
      const safe = typeof value === 'object' ? value as SolverInput<TState, TVerb, TTag> : ({
        state,
        verb,
        tag,
        metadata: { tag, createdAt: Date.now() },
      } as SolverInput<TState, TVerb, TTag>);
      return {
        state,
        code: verb,
        payload: {
          ...(safe as SolverInput<TState, TVerb, TTag>).metadata,
          mode,
          verb,
        },
        checksum: `${state}-${verb}` as `${TState}-${string}`,
      } as unknown as ResolveSolver<SolverInput<TState, TVerb, TTag>>;
    };
  };

  return { domain: state, mode, create } as SolverFactory<TState, TMode>;
};

export const instantiateAtScale = <
  TState extends OrbiEntity,
  TCommands extends readonly OrbiCommand[],
>(state: TState, commands: TCommands): SolverMatrix<TCommands> => {
  const parsed = commands.map((command) => ({
    state: (command.split('/')[1] ?? state) as OrbiEntity,
    verb: (command.split('/')[2] ?? 'compose') as OrbiVerb,
    tag: command.split('/')[3] ?? 'tag',
    metadata: {
      tag: command.split('/')[3] ?? 'tag',
      createdAt: Date.now(),
    },
  })) as SolverMap<TCommands>;

  return parsed.map((input) => {
    const solved = {
      state: input.state,
      code: input.verb,
      payload: {
        ...input.metadata,
      },
      checksum: `${input.state}-${input.verb}` as const,
    };
    return solved;
  }) as SolverMatrix<TCommands>;
};

export const orchestrationCatalog = [
  '/incident/compose/mission-one',
  '/workflow/simulate/mission-two',
  '/fabric/verify/mission-three',
  '/policy/reconcile/mission-four',
  '/telemetry/observe/mission-five',
  '/risk/drill/mission-six',
  '/safety/archive/mission-seven',
] as const;

export type OrchestrationProfile = SolverMatrix<typeof orchestrationCatalog>;

export const orchestrationCatalogProfile: OrchestrationProfile = instantiateAtScale(
  'incident',
  orchestrationCatalog,
);

export const orbiFactories = {
  compose: createSolverFactory('incident', 'strict').create('compose'),
  simulate: createSolverFactory('workflow', 'relaxed').create('simulate'),
  verify: createSolverFactory('fabric', 'strict').create('verify'),
  reconcile: createSolverFactory('policy', 'relaxed').create('reconcile'),
} as const;

export function runFactories(): SolverResult<OrbiEntity, string, unknown>[] {
  const outputs = [
    orbiFactories.compose('alpha', {
      state: 'incident',
      verb: 'compose',
      tag: 'alpha',
      metadata: { tag: 'alpha', createdAt: 0 },
    }),
    orbiFactories.simulate('beta', {
      state: 'workflow',
      verb: 'simulate',
      tag: 'beta',
      metadata: { tag: 'beta', createdAt: 1 },
    }),
    orbiFactories.verify('gamma', {
      state: 'fabric',
      verb: 'verify',
      tag: 'gamma',
      metadata: { tag: 'gamma', createdAt: 2 },
    }),
    orbiFactories.reconcile('delta', {
      state: 'policy',
      verb: 'reconcile',
      tag: 'delta',
      metadata: { tag: 'delta', createdAt: 3 },
    }),
  ];

  return outputs as SolverResult<OrbiEntity, string, unknown>[];
}

export const solverDispatch = <T extends readonly OrbiCommand[]>(commands: T) => {
  const plan = createSolverFactory('incident', 'strict');
  const createCompose = plan.create('compose');
  return commands.map((command) => {
    const [, rawState, rawVerb, tag] = command.split('/');
    const verb = (rawVerb ?? 'compose') as OrbiVerb;
    const output = createCompose((tag ?? 'seed') as `mission-${string}`, {
      state: 'incident',
      verb: 'compose',
      tag: (tag ?? 'seed') as string,
      metadata: {
        tag: tag ?? 'seed',
        createdAt: Date.now(),
      },
    }) as SolverResult<OrbiEntity, string, unknown>;
    return output as SolverResult<OrbiEntity, string, unknown>;
  }) as SolverMatrix<T>;
};

export const resolved = solverDispatch(orchestrationCatalog);

export type ConstraintSolverTuple<T extends readonly OrbiCommand[]> = {
  readonly matrix: SolverMatrix<T>;
  readonly union: SolverMatrix<T>[number];
};

export type NoConstraintSolverInput<T> = T extends OrbiCommand
  ? ParseCommand<T>
  : never;

export type SolverEnvelope<T extends OrbiCommand[]> = ConstraintSolverTuple<T> & {
  readonly envelope: {
    readonly items: T;
    readonly count: T['length'];
  };
};
