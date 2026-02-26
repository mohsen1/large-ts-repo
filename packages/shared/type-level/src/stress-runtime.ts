import type { NoInfer } from './patterns';
import {
  type ChainedCommandInput,
  type ConstraintMesh,
  type DeepCommandMap,
  type DeepNest,
  type Decrement,
  type ResolveCommand,
  type StressCommand,
  type StressDomain,
  type StressPayload,
  type StressVerb,
  type TemplateRoute,
  type TemplateMapped,
  type SolverTuple,
  type StressDomainUnion,
  stressDomains,
  type RouteProjection,
} from './stress-types';

import type { Brand } from './patterns';

type MutableNoInfer<T> = [T][T extends unknown ? 0 : never];

export interface SolverRoute {
  readonly route: string;
  readonly verb: StressVerb;
  readonly domain: StressDomainUnion;
  readonly severity: 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info';
  readonly catalogKey: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export type SolverInput<TStage extends string = string> = {
  readonly stage: TStage;
  readonly command: StressCommand;
  readonly route: RouteProjection<TStage>;
  readonly payload: ChainedCommandInput<`discover:${StressDomain}:high`>;
};

export type SolverOutput<TInput extends SolverInput> = {
  readonly input: TInput;
  readonly ok: boolean;
  readonly warnings: readonly string[];
  readonly profile: Readonly<Record<string, string>>;
};

export interface SolverHandler<TInput extends SolverInput, TOutput> {
  readonly id: Brand<string, 'solver-handler'>;
  (input: TInput): Promise<TOutput>;
}

type RouteTuple<T extends ReadonlyArray<string>> = [...T];

export interface SolverCatalog<T extends string = string> {
  readonly name: string;
  readonly key: T;
  readonly routes: readonly TemplateRoute<readonly [string, ...string[]], 'discover'>[];
  readonly profile: {
    readonly strict: boolean;
    readonly maxBranches: number;
  };
}

export const stressCatalog: SolverCatalog<string> = {
  name: 'core-solver',
  key: 'stress-catalog',
  routes: ['/discover/workload/recovery', '/discover/policy/recovery', '/discover/incident/recovery'],
  profile: {
    strict: true,
    maxBranches: 64,
  },
};

export const namedProfiles = {
  default: { maxDepth: 20, parallelism: 4, allowDryRun: true },
  strict: { maxDepth: 40, parallelism: 2, allowDryRun: false },
  exploratory: { maxDepth: 16, parallelism: 8, allowDryRun: true },
} as const satisfies Record<string, { maxDepth: number; parallelism: number; allowDryRun: boolean }>;

export type ConstraintPair<
  A extends string,
  B extends `signal:${A}`,
  C extends Record<A, B>[],
> = ConstraintMesh<A, B, C>;

export type SolverResolver<TInput extends SolverInput> =
  ResolveCommand<TInput['command']> extends infer Resolved
    ? Resolved extends { category: 'discover' }
      ? 'discoverer'
      : (Resolved extends { category: 'synthesize' }
          ? 'synthesizer'
          : 'general')
    : never;

export type SolverRouteTable<T extends ReadonlyArray<StressCommand>> = {
  [Index in keyof T]: T[Index] extends StressCommand
    ? {
        command: T[Index];
        route: TemplateRoute<readonly [StressDomain], StressVerb>;
      }
    : never;
};

export type SolverChain<Input extends SolverInput> = readonly [
  SolverRoute,
  ...SolverTuple<2>,
  { readonly stage: Input['stage']; readonly resolved: SolverResolver<Input> },
];

const isDiscovered = (payload: StressPayload<'discover'>) => payload.verb === 'discover';

export function classifyByDomain<T extends StressCommand>(command: T): 'workload' | 'playbook' | 'orchestrator' | 'fallback' {
  const [verb, domain] = command.split(':') as [StressVerb, StressDomain, 'low' | 'medium' | 'high' | 'critical' | 'emergency' | 'info'];
  if (verb === 'discover' || verb === 'observe' || verb === 'audit') {
    return 'fallback';
  }
  if (domain === 'workload' || domain === 'node' || domain === 'queue') {
    return 'workload';
  }
  if (domain === 'playbook' || domain === 'planner') {
    return 'playbook';
  }
  return 'orchestrator';
}

export function routeFromCommand<T extends StressCommand>(command: T): RouteProjection<`/recovery/${string}/${string}/${string}`> {
  const [_, entity, _rest] = command.split(':') as [StressVerb, string, string];
  const route = `/recovery/${_}/${entity}/${_rest}` as const;
  return { service: 'recovery', entity, id: _rest, parsed: route } as RouteProjection<`/recovery/${string}/${string}/${string}`>;
}

export function buildSolverRoutes<T extends readonly StressCommand[]>(commands: T): SolverRouteTable<T> {
  return commands.map((entry) => {
    const [, entity] = entry.split(':');
    const route = `/dispatch/${entity}/solve` as const;
    return {
      command: entry,
      route: route as TemplateRoute<readonly [string], 'discover'>,
    };
  }) as SolverRouteTable<T>;
}

export function summarizeSolver<T extends SolverInput>(input: T): SolverOutput<T> {
  const route = routeFromCommand(input.command);
  return {
    input,
    ok: input.command.length > 0 && input.stage.length > 0,
    warnings: [
      isDiscovered({
        verb: 'discover',
        command: 'discover:workload:high',
        envelope: {
          verb: 'discover',
          command: 'discover:workload:high',
          domain: 'workload',
          severity: 'high',
          route: '/recovery/discover:workload/high/route',
        },
      } as StressPayload<'discover'>)
        ? 'discovered'
        : undefined,
    ].filter((item): item is string => typeof item === 'string'),
    profile: {
      source: input.command,
      route: route.parsed,
      domain: route.entity as string,
    },
  };
}

export function resolveTemplateMapping<T extends Record<string, unknown>>(value: T): TemplateMapped<T> {
  const entries = Object.entries(value) as Array<[string, unknown]>;
  return Object.fromEntries(entries) as TemplateMapped<T>;
}

export function deepTemplateMap<T extends Record<string, unknown>>(value: T): DeepCommandMap<readonly ['workload', 'policy', 'scheduler']> {
  return {
    workload: {
      discover: {
        domain: 'workload',
        verb: 'discover',
        route: 'discover:workload:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      ingest: {
        domain: 'workload',
        verb: 'ingest',
        route: 'ingest:workload:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      materialize: {
        domain: 'workload',
        verb: 'materialize',
        route: 'materialize:workload:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      validate: {
        domain: 'workload',
        verb: 'validate',
        route: 'validate:workload:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      reconcile: {
        domain: 'workload',
        verb: 'reconcile',
        route: 'reconcile:workload:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      synthesize: {
        domain: 'workload',
        verb: 'synthesize',
        route: 'synthesize:workload:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      snapshot: {
        domain: 'workload',
        verb: 'snapshot',
        route: 'snapshot:workload:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      restore: {
        domain: 'workload',
        verb: 'restore',
        route: 'restore:workload:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      simulate: {
        domain: 'workload',
        verb: 'simulate',
        route: 'simulate:workload:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      inject: {
        domain: 'workload',
        verb: 'inject',
        route: 'inject:workload:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      amplify: {
        domain: 'workload',
        verb: 'amplify',
        route: 'amplify:workload:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      throttle: {
        domain: 'workload',
        verb: 'throttle',
        route: 'throttle:workload:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      rebalance: {
        domain: 'workload',
        verb: 'rebalance',
        route: 'rebalance:workload:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      reroute: {
        domain: 'workload',
        verb: 'reroute',
        route: 'reroute:workload:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      contain: {
        domain: 'workload',
        verb: 'contain',
        route: 'contain:workload:emergency',
        severity: 'emergency',
        nesting: [{}, {}] as any,
      },
      recover: {
        domain: 'workload',
        verb: 'recover',
        route: 'recover:workload:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      observe: {
        domain: 'workload',
        verb: 'observe',
        route: 'observe:workload:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      drill: {
        domain: 'workload',
        verb: 'drill',
        route: 'drill:workload:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      audit: {
        domain: 'workload',
        verb: 'audit',
        route: 'audit:workload:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      telemetry: {
        domain: 'workload',
        verb: 'telemetry',
        route: 'telemetry:workload:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      dispatch: {
        domain: 'workload',
        verb: 'dispatch',
        route: 'dispatch:workload:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
    },
    policy: {
      discover: {
        domain: 'policy',
        verb: 'discover',
        route: 'discover:policy:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      ingest: {
        domain: 'policy',
        verb: 'ingest',
        route: 'ingest:policy:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      materialize: {
        domain: 'policy',
        verb: 'materialize',
        route: 'materialize:policy:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      validate: {
        domain: 'policy',
        verb: 'validate',
        route: 'validate:policy:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      reconcile: {
        domain: 'policy',
        verb: 'reconcile',
        route: 'reconcile:policy:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      synthesize: {
        domain: 'policy',
        verb: 'synthesize',
        route: 'synthesize:policy:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      snapshot: {
        domain: 'policy',
        verb: 'snapshot',
        route: 'snapshot:policy:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      restore: {
        domain: 'policy',
        verb: 'restore',
        route: 'restore:policy:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      simulate: {
        domain: 'policy',
        verb: 'simulate',
        route: 'simulate:policy:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      inject: {
        domain: 'policy',
        verb: 'inject',
        route: 'inject:policy:emergency',
        severity: 'emergency',
        nesting: [{}, {}] as any,
      },
      amplify: {
        domain: 'policy',
        verb: 'amplify',
        route: 'amplify:policy:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      throttle: {
        domain: 'policy',
        verb: 'throttle',
        route: 'throttle:policy:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      rebalance: {
        domain: 'policy',
        verb: 'rebalance',
        route: 'rebalance:policy:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      reroute: {
        domain: 'policy',
        verb: 'reroute',
        route: 'reroute:policy:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      contain: {
        domain: 'policy',
        verb: 'contain',
        route: 'contain:policy:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      recover: {
        domain: 'policy',
        verb: 'recover',
        route: 'recover:policy:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      observe: {
        domain: 'policy',
        verb: 'observe',
        route: 'observe:policy:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      drill: {
        domain: 'policy',
        verb: 'drill',
        route: 'drill:policy:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      audit: {
        domain: 'policy',
        verb: 'audit',
        route: 'audit:policy:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      telemetry: {
        domain: 'policy',
        verb: 'telemetry',
        route: 'telemetry:policy:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      dispatch: {
        domain: 'policy',
        verb: 'dispatch',
        route: 'dispatch:policy:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
    },
    scheduler: {
      discover: {
        domain: 'scheduler',
        verb: 'discover',
        route: 'discover:scheduler:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      ingest: {
        domain: 'scheduler',
        verb: 'ingest',
        route: 'ingest:scheduler:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      materialize: {
        domain: 'scheduler',
        verb: 'materialize',
        route: 'materialize:scheduler:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      validate: {
        domain: 'scheduler',
        verb: 'validate',
        route: 'validate:scheduler:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      reconcile: {
        domain: 'scheduler',
        verb: 'reconcile',
        route: 'reconcile:scheduler:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      synthesize: {
        domain: 'scheduler',
        verb: 'synthesize',
        route: 'synthesize:scheduler:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      snapshot: {
        domain: 'scheduler',
        verb: 'snapshot',
        route: 'snapshot:scheduler:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      restore: {
        domain: 'scheduler',
        verb: 'restore',
        route: 'restore:scheduler:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      simulate: {
        domain: 'scheduler',
        verb: 'simulate',
        route: 'simulate:scheduler:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      inject: {
        domain: 'scheduler',
        verb: 'inject',
        route: 'inject:scheduler:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      amplify: {
        domain: 'scheduler',
        verb: 'amplify',
        route: 'amplify:scheduler:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      throttle: {
        domain: 'scheduler',
        verb: 'throttle',
        route: 'throttle:scheduler:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      rebalance: {
        domain: 'scheduler',
        verb: 'rebalance',
        route: 'rebalance:scheduler:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      reroute: {
        domain: 'scheduler',
        verb: 'reroute',
        route: 'reroute:scheduler:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      contain: {
        domain: 'scheduler',
        verb: 'contain',
        route: 'contain:scheduler:emergency',
        severity: 'emergency',
        nesting: [{}, {}] as any,
      },
      recover: {
        domain: 'scheduler',
        verb: 'recover',
        route: 'recover:scheduler:high',
        severity: 'high',
        nesting: [{}, {}] as any,
      },
      observe: {
        domain: 'scheduler',
        verb: 'observe',
        route: 'observe:scheduler:info',
        severity: 'info',
        nesting: [{}, {}] as any,
      },
      drill: {
        domain: 'scheduler',
        verb: 'drill',
        route: 'drill:scheduler:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
      audit: {
        domain: 'scheduler',
        verb: 'audit',
        route: 'audit:scheduler:medium',
        severity: 'medium',
        nesting: [{}, {}] as any,
      },
      telemetry: {
        domain: 'scheduler',
        verb: 'telemetry',
        route: 'telemetry:scheduler:critical',
        severity: 'critical',
        nesting: [{}, {}] as any,
      },
      dispatch: {
        domain: 'scheduler',
        verb: 'dispatch',
        route: 'dispatch:scheduler:low',
        severity: 'low',
        nesting: [{}, {}] as any,
      },
    },
  } as const;
}

class SolverScope implements Disposable {
  readonly #signals: string[] = [];
  readonly #open = true;
  constructor(private readonly domain: string) {}
  push(value: string): void {
    this.#signals.push(`${this.domain}:${value}`);
  }
  snapshot(): readonly string[] {
    return [...this.#signals];
  }
  [Symbol.dispose](): void {
    while (this.#signals.length > 0) {
      this.#signals.pop();
    }
  }
}

class AsyncSolverScope implements AsyncDisposable {
  readonly #stack: AsyncDisposableStack;
  constructor(private readonly tag: string) {
    this.#stack = new AsyncDisposableStack();
  }
  add<T extends AsyncDisposable>(resource: T): void {
    this.#stack.use(resource);
  }
  [Symbol.asyncDispose](): PromiseLike<void> {
    return this.#stack.disposeAsync();
  }
}

export const createSolverScope = (domain: string): SolverScope => {
  return new SolverScope(domain);
}

export async function withSolverScope<T>(
  domain: string,
  callback: (scope: SolverScope) => Promise<T>,
): Promise<T> {
  await using scope = createSolverScope(domain);
  scope.push('init');
  return callback(scope);
}

export async function withAsyncSolverScope<T>(
  domain: string,
  callback: (scope: AsyncSolverScope) => Promise<T>,
): Promise<T> {
  await using scope = new AsyncSolverScope(domain);
  return callback(scope);
}

export function mapSolverRoutes<TDomains extends readonly string[]>(
  domains: NoInfer<TDomains>,
): RouteTuple<TDomains> {
  return domains.flatMap((domain) => [
    `/recovery/${domain}/dispatch` as `/${string}/${string}/${string}`,
    `/recovery/${domain}/replay` as `/${string}/${string}/${string}`,
  ]) as RouteTuple<TDomains>;
}

export function solveWithConstraints<
  TDomain extends string,
  TVerb extends `signal:${TDomain}`,
  TPayload extends Record<TDomain, TVerb>,
>(domain: TDomain, verb: TVerb, payload: TPayload): ConstraintPair<TDomain, TVerb, [TPayload]> {
  return {
    domain,
    signal: verb,
    records: [payload],
    checksum: `${domain}-${verb}`,
  };
}

export function overloadedSolver(input: string): string;
export function overloadedSolver(input: number): number;
export function overloadedSolver<T extends string>(input: T, fallback: T): T;
export function overloadedSolver(input: string | number, fallback = ''): string | number {
  if (typeof input === 'number') {
    return input + 1;
  }
  if (fallback.length > 0) {
    return `${input}:${fallback}`;
  }
  if (input.length > 2 && input.includes(':')) {
    return input.toUpperCase();
  }
  return input;
}

export async function runSolverMatrix<T extends readonly SolverInput[]>(
  inputs: MutableNoInfer<T>,
): Promise<ReadonlyArray<SolverOutput<T[number]>>> {
  const outputs: SolverOutput<T[number]>[] = [];
  for (const input of inputs) {
    await withSolverScope(input.command, async (scope) => {
      scope.push(input.stage);
      outputs.push(summarizeSolver(input as SolverInput) as SolverOutput<T[number]>);
    });
  }
  return outputs;
}

export const defaultDomainCount = stressDomains.length;
export const getSeededSolverDomains = async () => Promise.resolve(stressDomains.map((domain) => ({ domain, domainLength: domain.length })));

export const seededSolverDomains = getSeededSolverDomains();

export const deepSeed = {
  layers: {} as DeepNest<Record<string, string>, 12>,
  map: deepTemplateMap({ one: 'alpha', two: 2, three: 3 }),
} satisfies {
  layers: DeepNest<Record<string, string>, 12>;
  map: ReturnType<typeof deepTemplateMap>;
};

export const solverProfiles = {
  ...namedProfiles,
  strict: {
    ...namedProfiles.strict,
    allowedVerbs: ['discover', 'validate', 'recover'] as const,
  },
  exploratory: {
    ...namedProfiles.exploratory,
    allowedVerbs: ['synthesize', 'simulate', 'inject'] as const,
  },
};
