import {
  atlasRouteCatalogRoutes,
  type RecoveryCommand,
  type RecoveryDomain,
  type RecoveryRoute,
  type ResolveRouteDistributive,
} from './stress-synthetic-atlas';

type NoInfer<T> = [T][T extends any ? 0 : never];
type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N ? T : BuildTuple<N, [...T, unknown]>;
type Decrement<N extends number> = BuildTuple<N> extends [...infer Prefix, unknown] ? Prefix['length'] : 0;

export interface SolverContext<TStage> {
  readonly depth: number;
  readonly stage: TStage;
}

export interface SolverAdapter<TInput, TOutput, TContext = SolverContext<unknown>> {
  readonly name: string;
  readonly execute: (input: TInput, context: TContext) => TOutput;
  readonly phase: 'ingest' | 'transform' | 'emit';
}

export interface SolverFactory<TInput, TOutput, TContext = SolverContext<unknown>> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly adapter: SolverAdapter<TInput, TOutput, TContext>;
}

export type SolverInput<
  TLabel extends string,
  TCommands extends RecoveryCommand = RecoveryCommand,
  TDomain extends RecoveryDomain = RecoveryDomain,
> = {
  readonly label: TLabel;
  readonly command: TCommands;
  readonly domain: TDomain;
  readonly route: RecoveryRoute;
};

export type SolverOutput<TInput, TRaw extends RecoveryRoute> = {
  readonly input: TInput;
  readonly raw: TRaw;
  readonly solved: readonly ResolveRouteDistributive<TRaw>[];
};

export function createSolver<TInput, TOutput>(
  name: string,
  execute: (input: TInput) => TOutput,
  phase: SolverAdapter<TInput, TOutput>['phase'] = 'transform',
): SolverAdapter<TInput, TOutput> {
  return {
    name,
    phase,
    execute: (input) => execute(input as TInput) as TOutput,
  };
}

export const solverRegistry = {
  ingest: 'ingest',
  transform: 'transform',
  emit: 'emit',
} as const;

export type SolverRegistryKey = keyof typeof solverRegistry;
export const solverChainSteps: readonly SolverRegistryKey[] = ['ingest', 'transform', 'emit', 'emit'];

type SolverChainStatus = 'pending' | 'running' | 'stable' | 'degraded' | 'failed';

export function runSolverChain<TSeed extends string>(
  seed: TSeed,
  context: NoInfer<SolverContext<string>>,
  steps: readonly SolverRegistryKey[],
): { status: SolverChainStatus; value: TSeed } {
  let value = seed;
  let status: SolverChainStatus = 'pending';

  for (const step of steps) {
    if (step === 'ingest') {
      value = `${step}:${value}` as TSeed;
      status = 'running';
    }
    if (step === 'transform') {
      value = `${value}:transform:${context.depth}` as TSeed;
      status = value.length > 80 ? 'degraded' : status;
    }
    if (step === 'emit') {
      status = value.length > 160 ? 'failed' : 'stable';
    }
    if (context.depth > 9) {
      status = 'failed';
    }
  }

  return { status, value };
}

type BranchTag =
  | 'alpha'
  | 'beta'
  | 'gamma'
  | 'delta'
  | 'epsilon'
  | 'zeta'
  | 'eta'
  | 'theta'
  | 'iota'
  | 'kappa'
  | 'lambda'
  | 'mu'
  | 'nu'
  | 'xi'
  | 'omicron'
  | 'pi'
  | 'rho'
  | 'sigma'
  | 'tau'
  | 'upsilon'
  | 'phi'
  | 'chi'
  | 'psi'
  | 'omega';

export type BranchMatrix<T extends readonly string[]> = {
  readonly value: T;
  readonly matrix: {
    [K in BranchTag]: {
      readonly enabled: boolean;
      readonly route: K extends 'alpha'
        ? string
        : K extends 'beta'
          ? boolean
          : K extends 'gamma'
            ? number
            : K extends 'delta'
              ? readonly string[]
              : K extends 'epsilon'
                ? SolverContext<RecoveryCommand>
                : unknown;
    };
  };
};

type DeepSolverBranch<T extends BranchTag, Depth extends number> =
  Depth extends 0
    ? { readonly tag: T; readonly leaf: true }
    : { readonly tag: T; readonly nested: DeepSolverBranch<T, Decrement<Depth>> };

export const routeByCommand = (command: RecoveryCommand): readonly string[] =>
  atlasRouteCatalogRoutes.filter((route) => route.startsWith(`${command}:`));

export function branchResolver<T extends RecoveryCommand>(command: T): BranchMatrix<[T]> {
  const commandRoutes = routeByCommand(command);
  return {
    value: [command],
    matrix: {
      alpha: { enabled: true, route: command },
      beta: { enabled: false, route: command.length > 3 },
      gamma: { enabled: true, route: command.length },
      delta: { enabled: true, route: [command] },
      epsilon: { enabled: true, route: { depth: 0, stage: command } },
      zeta: { enabled: false, route: false },
      eta: { enabled: true, route: true },
      theta: { enabled: true, route: 1 },
      iota: { enabled: true, route: 2 },
      kappa: { enabled: false, route: 'k' },
      lambda: { enabled: true, route: command },
      mu: { enabled: true, route: {} as Record<string, unknown> },
      nu: { enabled: true, route: 1 },
      xi: { enabled: false, route: command.includes('a') },
      omicron: { enabled: true, route: `${command}:pi` },
      pi: { enabled: false, route: command },
      rho: { enabled: true, route: command.length },
      sigma: { enabled: true, route: Symbol.for(command) },
      tau: { enabled: true, route: {} },
      upsilon: { enabled: false, route: 'x' },
      phi: { enabled: true, route: command },
      chi: { enabled: true, route: commandRoutes.length },
      psi: { enabled: false, route: `${command}:${commandRoutes.length}` },
      omega: { enabled: true, route: commandRoutes.slice(0, 2) },
    },
  };
}

export type SolverConstraint<TDomain extends RecoveryDomain, TCmd extends RecoveryCommand> = {
  readonly domain: TDomain;
  readonly command: TCmd;
  readonly routeCount: number;
};

export const solverInputContracts = atlasRouteCatalogRoutes
  .slice(0, 10)
  .map((route) => ({
    label: 'catalog',
    command: route.split(':')[0] as RecoveryCommand,
    domain: route.split(':')[1] as RecoveryDomain,
    route: route as RecoveryRoute,
  })) as unknown as SolverInput<'catalog', RecoveryCommand, RecoveryDomain>[];

export const buildSolverInput = (
  route: RecoveryRoute,
  context: SolverContext<RecoveryCommand>,
): SolverInput<'catalog', RecoveryCommand, RecoveryDomain> => {
  const [command, domain] = route.split(':');
  return {
    label: 'catalog',
    command: command as RecoveryCommand,
    domain: (domain as RecoveryDomain) ?? 'incident',
    route,
  };
};

export const mapSolverInputByRoute = (
  routes: readonly RecoveryRoute[],
): SolverOutput<RecoveryCommand, RecoveryRoute> => {
  const first = (routes[0] ?? 'boot:incident:low') as RecoveryRoute;
  const context = buildSolverInput(first, { depth: 1, stage: 'boot' });
  return {
    input: context.command,
    raw: first,
    solved: [first as unknown as ResolveRouteDistributive<RecoveryRoute>],
  };
};

export const solverTypeMap = {
  a: branchResolver('boot'),
  b: branchResolver('discover'),
  c: branchResolver('assess'),
};

export const solverMetaTrace: DeepSolverBranch<BranchTag, 5> = {
  tag: 'alpha',
  nested: {
    tag: 'beta',
    nested: {
      tag: 'gamma',
      nested: {
        tag: 'delta',
        nested: {
          tag: 'epsilon',
          nested: {
            tag: 'zeta',
            leaf: true,
          },
        },
      },
    },
  },
};
