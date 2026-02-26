export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type ArsenalDomain = 'runtime' | 'mesh' | 'fleet' | 'recovery' | 'telemetry';
export type ArsenalVerb = 'create' | 'update' | 'resolve' | 'route' | 'dispatch' | 'rollback';
export type ArsenalMode = 'dry-run' | 'execute' | 'observe';

export interface ArsenalEnvelope<
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload = unknown,
> {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly payload: TPayload;
}

export interface SolverFactoryConfig<T extends string> {
  readonly name: T;
  readonly threshold: number;
  readonly active: boolean;
}

export type ConstraintA<
  T extends Record<string, unknown>,
  U extends T,
  V extends Record<keyof U, keyof T>,
> = {
  readonly input: U;
  readonly source: T;
  readonly keys: keyof V;
};

export type SolverSolver<
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload,
> = (input: ArsenalEnvelope<TDomain, TVerb, TMode, TPayload>) => Promise<ArsenalEnvelope<TDomain, TVerb, TMode, Readonly<TPayload>>>;

export type SolverSignature<
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload,
> = <TInput extends ArsenalEnvelope<TDomain, TVerb, TMode, TPayload>>(
  input: TInput,
  config: SolverFactoryConfig<TDomain>,
) => SolverFactory<TDomain, TVerb, TMode, TInput['payload']>;

export interface SolverFactory<
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload,
  TConstraint = unknown,
> {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly signature: SolverSignature<TDomain, TVerb, TMode, TPayload>;
  readonly constraint: TConstraint;
}

export const createSolver = <
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload extends Record<string, unknown>,
>(
  input: ArsenalEnvelope<TDomain, TVerb, TMode, TPayload>,
  config: SolverFactoryConfig<TDomain>,
): SolverEnvelope<
  TDomain,
  TVerb,
  TMode,
  TPayload,
  {
    readonly status: 'created';
    readonly score: number;
  }
> => {
  const metadata: SolverFactoryConfig<TDomain> = {
    name: input.domain,
    threshold: 100,
    active: true,
  };
  return {
    domain: input.domain,
    verb: input.verb,
    mode: input.mode,
    metadata,
    payload: {
      ...input.payload,
      ...config,
      status: 'created',
      score: config.threshold * 1.5,
    },
  } as SolverEnvelope<TDomain, TVerb, TMode, TPayload, { status: 'created'; score: number }>;
};

export type SolverEnvelope<
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload,
  TMeta,
> = {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly payload: TPayload & TMeta;
  readonly metadata: SolverFactoryConfig<TDomain>;
};

export type SolverCatalog = {
  readonly runtime: SolverFactory<'runtime', 'route', 'execute', { route: string }>;
  readonly mesh: SolverFactory<'mesh', 'dispatch', 'dry-run', { mesh: true }>;
  readonly fleet: SolverFactory<'fleet', 'create', 'observe', { fleet: string }>;
};

export function buildArsenal<TPayload extends Record<string, unknown>>(
  input: ArsenalEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, TPayload>,
): Promise<SolverEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, TPayload, { status: 'ok' }>>;
export function buildArsenal<TPayload extends Record<string, unknown>>(
  input: ArsenalEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, TPayload>,
): Promise<SolverEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, TPayload, { status: 'ok' }>> {
  return Promise.resolve({
    domain: input.domain,
    verb: input.verb,
    mode: input.mode,
    payload: { ...(input.payload as object), status: 'ok' },
    metadata: { name: input.domain, threshold: 100, active: true },
  }) as Promise<SolverEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, TPayload, { status: 'ok' }>>;
}

export const solveWithInference = <
  const TDomain extends ArsenalDomain,
  TInput extends Record<string, unknown>,
>(
  domain: TDomain,
  input: TInput,
  mode: NoInfer<ArsenalMode>,
) => {
  return {
    domain,
    verb: 'route' as ArsenalVerb,
    mode,
    payload: input satisfies Record<string, unknown> ? input : {},
  };
};

export const composeSolverFactory = <
  TDomain extends ArsenalDomain,
  TVerb extends ArsenalVerb,
  TMode extends ArsenalMode,
  TPayload extends Record<string, unknown>,
>(
  config: SolverFactoryConfig<TDomain>,
  factory: <TNext extends ArsenalEnvelope<TDomain, TVerb, TMode, TPayload>>(input: TNext) => SolverEnvelope<TDomain, TVerb, TMode, TPayload, { status: 'seed' }>,
) => {
  return <TNext extends ArsenalEnvelope<TDomain, TVerb, TMode, TPayload>>(input: TNext) => {
    const base = createSolver(input, config);
    const traced = factory({
      ...input,
      payload: {
        ...input.payload,
        status: 'seed',
      },
    } as TNext);
    return { base, traced, route: `${config.name}::${input.verb}` };
  };
};

export const createArsenalCatalog = () => {
  const configs = [
    { name: 'runtime', threshold: 9, active: true },
    { name: 'mesh', threshold: 7, active: false },
    { name: 'fleet', threshold: 4, active: true },
  ] as const satisfies readonly SolverFactoryConfig<ArsenalDomain>[];

  const envelopes: readonly ArsenalEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, { route: string }>[] = [
    { domain: 'runtime', verb: 'route', mode: 'execute', payload: { route: 'runtime-route' } },
    { domain: 'mesh', verb: 'dispatch', mode: 'dry-run', payload: { route: 'mesh-route' } },
    { domain: 'fleet', verb: 'create', mode: 'observe', payload: { route: 'fleet-route' } },
  ];

  const solutions = envelopes.map((item) =>
    buildArsenal({
      ...item,
      payload: { ...item.payload },
    }),
  );
  return {
    configs,
    envelopes,
    solutions,
  };
};

type EnvelopePayloadAt<T extends readonly ArsenalEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, unknown>[], Index extends keyof T> = T[Index] extends ArsenalEnvelope<
  ArsenalDomain,
  ArsenalVerb,
  ArsenalMode,
  infer TPayload
>
  ? TPayload
  : never;

export type InstantiationScale<T extends readonly ArsenalEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, unknown>[]> = {
  readonly [Index in keyof T]: SolverEnvelope<
    ArsenalDomain,
    ArsenalVerb,
    ArsenalMode,
    EnvelopePayloadAt<T, Index>,
    { status: 'ok' }
  >;
};

export const instantiateAtScale = () => {
  const catalog = [
    { domain: 'runtime', verb: 'route', mode: 'execute', payload: { route: 'fleet/execute/actor' } },
    { domain: 'mesh', verb: 'dispatch', mode: 'dry-run', payload: { route: 'mesh/dispatch/signal' } },
    { domain: 'fleet', verb: 'create', mode: 'observe', payload: { route: 'fleet/create/actor' } },
    { domain: 'recovery', verb: 'rollback', mode: 'observe', payload: { route: 'recovery/rollback/timeline' } },
    { domain: 'telemetry', verb: 'resolve', mode: 'execute', payload: { route: 'telemetry/observe/trace' } },
  ] as const satisfies readonly ArsenalEnvelope<ArsenalDomain, ArsenalVerb, ArsenalMode, { route: string }>[];

  return catalog.map((entry, index) => ({
    domain: entry.domain,
    verb: entry.verb,
    mode: entry.mode,
    payload: {
      ...entry.payload,
      status: 'ok' as const,
    },
    metadata: { name: entry.domain, threshold: index * 3, active: index % 2 === 0 },
  })) as unknown as InstantiationScale<typeof catalog>;
};
