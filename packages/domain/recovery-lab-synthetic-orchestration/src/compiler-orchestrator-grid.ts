import {
  type ControlMode,
  runControlFlowScenario,
} from './compiler-control-lab';
import { type WorkRoute, buildRouteProfile } from '@shared/type-level/stress-conditional-union-grid';
import {
  type ConstraintUnion,
  type BrandedId,
    makeConstraintChain,
  makeNominal,
  evaluateConstraint,
} from '@shared/type-level/stress-constraint-conflict-suite';
import {
  buildSolverMatrix,
    type RecursionResultUnion,
  recursiveSolverChain,
  parseRoute,
} from '@shared/type-level/stress-recursive-template-solver';

export interface DisposableArena {
  [Symbol.asyncDispose]?(): Promise<void>;
}

export class ArenaScope implements AsyncDisposable {
  private readonly slots: Array<DisposableArena>;
  private disposed = false;

  public constructor() {
    this.slots = [];
  }

  public add(arena: DisposableArena): void {
    this.slots.push(arena);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
    const stack = this.slots.map((arena) => arena[Symbol.asyncDispose]?.() ?? Promise.resolve());
    await Promise.all(stack);
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }
}

export type ArenaFactory<T extends WorkRoute> = {
  readonly domain: string;
  readonly route: T;
  readonly mode: ControlMode;
  readonly routeTrace: ReadonlyArray<RecursionResultUnion<T, 8>>;
};

export type SolverArenaResult<T extends WorkRoute> = {
  readonly route: T;
  readonly solved: ReadonlyArray<RecursionResultUnion<T, 8>>;
  readonly matrix: ReturnType<typeof buildSolverMatrix>;
  readonly constraints: ReturnType<typeof evaluateConstraint>;
};

export interface OrchestratorPayload {
  readonly route: WorkRoute;
  readonly mode: ControlMode;
  readonly constraints: readonly ConstraintUnion[];
}

export type ArenaInvocationResult<TMode extends ControlMode, TOutput> = {
  readonly mode: TMode;
  readonly output: TOutput;
  readonly trace: ReadonlyArray<string>;
};

export type SolverFactory<TInput, TOutput> = <TMode extends ControlMode>(
  input: TInput,
  mode: TMode,
) => ArenaInvocationResult<TMode, TOutput>;

export class ControlArena {
  private readonly route: WorkRoute;
  private readonly mode: ControlMode;
  private readonly routeProfile: ReturnType<typeof buildRouteProfile>;
  private readonly constraints: readonly ConstraintUnion[];

  public constructor(payload: OrchestratorPayload) {
    this.route = payload.route;
    this.mode = payload.mode;
    this.routeProfile = buildRouteProfile(payload.route as WorkRoute);
    this.constraints = payload.constraints;
  }

  public evaluate(): SolverArenaResult<WorkRoute> {
    const report = runControlFlowScenario([this.route], this.mode, {
      serviceName: 'orchestrator-grid',
      endpoints: [
        {
          path: this.route,
          method: 'POST',
          payload: {
            route: this.route,
            profile: this.routeProfile,
          },
        },
      ],
    });

    const routeTrace = recursiveSolverChain(parseRoute(this.route).replace('leaf:', '')) as ReadonlyArray<RecursionResultUnion<WorkRoute, 8>>;
    const matrix = buildSolverMatrix([this.route, this.route]);

    return {
      route: this.route,
      solved: routeTrace,
      matrix,
      constraints: evaluateConstraint(this.constraints),
    };
  }

  public get profile(): ReturnType<typeof buildRouteProfile> {
    return this.routeProfile;
  }
}

export const runOrchestratorMatrix = <T extends WorkRoute>(
  routes: readonly T[],
  mode: ControlMode,
): ReadonlyArray<SolverArenaResult<T>> => {
  const constraints = routes.map((route) =>
    makeConstraintChain({
      key: route,
      payload: {
        [route]: {
          input: {
            tenant: route,
            namespace: route,
          },
          severity: route.includes('-') ? 'tenant-prefixed' : 'tenant-raw',
        },
      } as Record<WorkRoute, { input: { tenant: string; namespace: string }; severity: 'tenant-prefixed' | 'tenant-raw' }>,
    }),
  );

  const evaluated = routes.map((route) => {
    const arena = new ControlArena({ route, mode, constraints: constraints as readonly ConstraintUnion[] });
    return arena.evaluate();
  });

  return evaluated as unknown as ReadonlyArray<SolverArenaResult<T>>;
};

export const runOrchestratorBatch = <T extends WorkRoute>(
  routes: readonly T[],
): ReadonlyArray<SolverArenaResult<T>> => {
  return runOrchestratorMatrix(routes, 'execute');
};

export const makeDisposables = async <T, TRoute extends WorkRoute>(
  factory: SolverFactory<T, ArenaFactory<TRoute>>,
): Promise<{
  readonly result: ArenaInvocationResult<ControlMode, ArenaFactory<TRoute>>;
  readonly mark: BrandedId<'disposable'>;
}> => {
  const arena = new ArenaScope();
  const stack = new AsyncDisposableStack();

  const asyncResource = {
    [Symbol.asyncDispose]: async () => {
      arena.isDisposed;
    },
  };

  stack.use(asyncResource);
  try {
    const solver = factory({} as T, 'execute');
    await using _scope = arena;
    return {
      result: {
        ...solver,
        mode: solver.mode as ControlMode,
        output: solver.output,
        trace: solver.trace,
      } as ArenaInvocationResult<ControlMode, ArenaFactory<TRoute>>,
      mark: makeNominal('disposable'),
    };
  } finally {
    await stack.disposeAsync();
  }
};

export const buildArenaFactory = <T extends WorkRoute>(
  route: T,
  mode: ControlMode,
): SolverFactory<T, ArenaFactory<T>> => {
  return ((selectedMode: ControlMode) => {
    const resolved = runOrchestratorMatrix([route], selectedMode);
    const first = resolved[0];

    const value = {
      domain: route,
      route,
      mode: selectedMode,
      routeTrace: (first?.solved ?? []) as RecursionResultUnion<T, 8>[],
    } as ArenaFactory<T>;

    return {
      mode: selectedMode,
      output: value,
      trace: ['factory:start', route],
    } as ArenaInvocationResult<ControlMode, ArenaFactory<T>>;
  }) as SolverFactory<T, ArenaFactory<T>>;
};

export const executeOrchestratorBatch = <T extends WorkRoute>(
  routes: readonly T[],
): {
  readonly suites: ReadonlyArray<SolverArenaResult<T>>;
  readonly dispatch: ReturnType<typeof evaluateConstraint>;
  readonly tokens: readonly BrandedId<'batch-token'>[];
} => {
  const suites = runOrchestratorMatrix(routes, 'execute');
  const dispatch = evaluateConstraint(
    suites.flatMap((suite) => suite.constraints as ReadonlyArray<Record<string, unknown>> as never),
  ) as ReturnType<typeof evaluateConstraint>;
  const tokens = suites.map((_suite, index) => makeNominal(`batch-token-${index}`) as unknown as BrandedId<'batch-token'>);

  return { suites, dispatch, tokens };
};

export const buildSolverInvocation = <T extends WorkRoute>(
  input: ReturnType<typeof buildArenaFactory<T>>,
): ReturnType<typeof buildArenaFactory<T>> => {
  const route = input as ReturnType<typeof buildArenaFactory<T>>;
  return route;
};
