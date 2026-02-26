export type NoInfer<T> = [T][T extends unknown ? 0 : never];

export type SolverMode = 'preview' | 'probe' | 'recover' | 'audit';

export type SolverProfile<TMode extends SolverMode = SolverMode> = {
  readonly seed: string;
  readonly mode: TMode;
  readonly version: `${number}.${number}.${number}`;
  readonly namespace: string;
};

export type SolverPayload<TMode extends SolverMode> = {
  readonly mode: TMode;
  readonly score: number;
  readonly route: string;
  readonly markers: readonly string[];
};

export type SolverOutput<TMode extends SolverMode, TMeta> = {
  readonly mode: TMode;
  readonly output: boolean;
  readonly payload: TMeta;
  readonly trace: readonly string[];
};

export interface SolverAdapter<TMode extends SolverMode, TMeta, TProfile extends SolverProfile<TMode> = SolverProfile<TMode>> {
  readonly profile: TProfile;
  invoke(input: SolverPayload<TMode>): SolverOutput<TMode, TMeta>;
}

type SolverFactoryMetaAdapter = SolverAdapter<SolverMode, { readonly ok: boolean; readonly route: string }>;

export type SolverRecord<TMode extends SolverMode, TMeta> = {
  readonly seed: string;
  readonly mode: TMode;
  readonly history: readonly {
    readonly value: TMeta;
    readonly depth: number;
  }[];
  readonly checks: {
    readonly profile: SolverProfile<TMode>;
    readonly active: TMeta;
  };
};

type ConstraintA<T extends string> = T extends `id-${string}` ? T : never;

type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : BuildTuple<N, [...T, unknown]>;
type Decrement<N extends number> = BuildTuple<N> extends [unknown, ...infer Rest] ? Rest['length'] : 0;

export type OverloadSignatureA<TSeed extends string, TMode extends SolverMode> = (
  seed: ConstraintA<TSeed>,
  mode: TMode
) => SolverRecord<TMode, ConstraintA<TSeed>>;

export type OverloadSignatureB<TSeed extends string, TMode extends SolverMode, TMeta> = (
  seed: ConstraintA<TSeed>,
  mode: TMode,
  config: { readonly meta: TMeta; readonly version: TMode }
) => SolverRecord<TMode, TMeta>;

export const buildSolverFactory = <
  TSeed extends string,
  TMode extends SolverMode,
  TMeta = { readonly ok: boolean; readonly route: string }
>(
  seed: NoInfer<TSeed>,
  mode: TMode,
  opts: {
    readonly version?: SolverProfile<TMode>['version'];
    readonly markers?: readonly string[];
    readonly namespace?: string;
    readonly meta?: TMeta;
  } = {},
): SolverAdapter<TMode, TMeta, SolverProfile<TMode>> => {
  const profile: SolverProfile<TMode> = {
    seed,
    mode,
    version: opts.version ?? '1.0.0',
    namespace: opts.namespace ?? 'shared-stress',
  };

  const adapter: SolverAdapter<TMode, TMeta, SolverProfile<TMode>> = {
    profile,
    invoke: (input): SolverOutput<TMode, TMeta> => {
      const trace = [...(opts.markers ?? []), input.route, profile.seed, profile.namespace];
      const payload = (opts.meta ?? ({
        ok: input.score >= 0,
        route: input.route,
      } as TMeta));
      return {
        mode: input.mode,
        output: payload ? true : true,
        payload,
        trace,
      };
    },
  };

  return adapter;
};

export function forgeSolver<TSeed extends string, TMode extends SolverMode>(seed: TSeed, mode: TMode): SolverRecord<TMode, ConstraintA<TSeed>>;
export function forgeSolver<TSeed extends string, TMode extends SolverMode, TMeta>(
  seed: TSeed,
  mode: TMode,
  config: { readonly meta: TMeta; readonly version: SolverProfile<TMode>['version'] },
): SolverRecord<TMode, TMeta>;
export function forgeSolver<TSeed extends string, TMode extends SolverMode, TMeta>(
  seed: TSeed,
  mode: TMode,
  config?: { readonly meta: TMeta; readonly version: SolverProfile<TMode>['version'] },
): SolverRecord<TMode, TMeta | ConstraintA<TSeed>> {
  const active = (config?.meta ?? ({ ok: true, route: `/${seed}` } as { ok: boolean; route: string })) as TMeta | ConstraintA<TSeed>;
  return {
    seed,
    mode,
    history: [
      {
        value: active,
        depth: 0,
      },
      {
        value: active,
        depth: 1,
      },
    ],
    checks: {
      profile: {
        seed,
        mode,
        version: config?.version ?? '2.0.0',
        namespace: 'forge',
      },
      active,
    },
  };
}

export const solveWithFactory = <
  TMode extends SolverMode,
  TMeta,
  TSeed extends string = string,
>(
  factory: SolverAdapter<TMode, TMeta>,
  mode: TMode,
  options?: {
    readonly route?: string;
    readonly markers?: readonly string[];
    readonly seed?: NoInfer<TSeed>;
  },
): SolverOutput<TMode, TMeta> => {
  const payload: SolverPayload<TMode> = {
    mode,
    score: (options?.markers?.length ?? 0) * 11,
    route: options?.route ?? `/${factory.profile.seed}`,
    markers: options?.markers ?? [factory.profile.namespace],
  };
  return factory.invoke(payload);
};

export const makeSolverMap = <T extends readonly string[]>(seeds: T): {
  readonly records: SolverProfile<'probe'>[];
  readonly factories: Readonly<Record<T[number] & string, SolverFactoryMetaAdapter>>;
} => {
  const records: SolverProfile<'probe'>[] = [];
  const factories: Partial<Record<string, SolverFactoryMetaAdapter>> = {};
  for (const seed of seeds) {
    const adapter = buildSolverFactory<string, 'probe', { readonly ok: boolean; readonly route: string }>(seed, 'probe');
    records.push(adapter.profile);
    factories[seed] = adapter as SolverFactoryMetaAdapter;
  }

  return {
    records,
    factories: factories as Readonly<Record<T[number] & string, SolverFactoryMetaAdapter>>,
  };
};

export const invokeSolverSuite = <
  T extends readonly string[],
  M extends SolverMode,
>(
  seeds: T,
  mode: NoInfer<M>,
  opts: {
    readonly namespace: string;
    readonly seedMap?: Partial<Record<M, string>>;
  },
): readonly SolverOutput<M, { readonly route: string; readonly ok: boolean }>[] => {
  const outputs: SolverOutput<M, { readonly route: string; readonly ok: boolean }>[] = [];

  for (const seed of seeds) {
    const factorySeed = opts.seedMap?.[mode] ?? seed;
    const adapter = buildSolverFactory<string, M, { readonly route: string; readonly ok: boolean }>(
      factorySeed,
      mode,
      {
        namespace: opts.namespace,
        markers: [mode],
        meta: undefined,
      },
    );
    const output = solveWithFactory(adapter, mode, {
      route: `/suite/${factorySeed}`,
      markers: [opts.namespace, factorySeed, mode],
    }) as SolverOutput<M, { readonly route: string; readonly ok: boolean }>;
    outputs.push(output);
  }

  return outputs as readonly SolverOutput<M, { readonly route: string; readonly ok: boolean }>[];
};

export const resolveSolverChain = <
  T extends readonly string[],
  M extends SolverMode,
>(
  suite: {
    readonly seeds: T;
    readonly mode: M;
  },
): {
  readonly suite: readonly SolverOutput<M, { readonly route: string; readonly ok: boolean }>[];
  readonly checksum: number;
} => {
  const outputs = invokeSolverSuite(suite.seeds, suite.mode, { namespace: 'suite' }) as unknown as readonly SolverOutput<
    M,
    { readonly route: string; readonly ok: boolean }
  >[];
  return {
    suite: outputs,
    checksum: outputs.reduce((acc, output) => acc + output.trace.length + output.payload.route.length, 0),
  };
};

export type SolverMapTuple = {
  readonly bundle: readonly unknown[];
  readonly tags: readonly unknown[];
  readonly recursive: {
    readonly terminal: false;
    readonly value: { readonly route: string; readonly mode: SolverMode };
    readonly depth: number;
    readonly history: readonly unknown[];
    readonly next: null;
  };
  readonly branch: `seed:${number}`;
};

export const solveOverloaded = (
  seed: string,
  mode: SolverMode,
  config?: { readonly meta?: { readonly accepted: boolean; readonly route: string } },
): SolverRecord<SolverMode, { readonly accepted: boolean; readonly route: string }> =>
  forgeSolver(seed, mode, { meta: config?.meta ?? { accepted: true, route: `/seed/${seed}` }, version: '1.0.0' });
