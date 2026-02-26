import type { NoInfer } from '@shared/type-level';
import {
  buildConstraintChain,
  solveWithConstraint,
} from '@shared/type-level';
import {
  routeDecisions,
  routeCatalog,
} from '@shared/type-level/stress-conditional-depth-grid';

export { buildConstraintChain, solveWithConstraint };

export interface SolverFactory<TKind extends string, TInput, TOutput, TMeta extends Record<string, unknown> = Record<string, unknown>> {
  kind: TKind;
  input: TInput;
  output: TOutput;
  meta: TMeta;
}

export type SolverFactoryOutput<
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown>,
> = SolverFactory<TKind, TInput, TOutput, TMeta>;

export interface SolverInvocation<K extends string, I, O> {
  readonly kind: K;
  readonly input: I;
  readonly output: O;
  execute: (input: I) => Promise<O>;
}

export type SolverMetaWithContext<TMeta extends Record<string, unknown>> =
  | ({ readonly confidence: 0.5 } & TMeta)
  | ({ readonly confidence: 0.5; readonly context?: Record<string, unknown> } & TMeta);

export interface Branded<T, B extends string> {
  value: T;
  readonly __brand: B;
}

export type OverloadedFactory = {
  <TKind extends string, TInput, TOutput>(
    kind: TKind,
    input: TInput,
    output: TOutput,
  ): SolverFactoryOutput<TKind, TInput, TOutput, { readonly confidence: 0.5 }>;
  <TKind extends string, TInput, TOutput, TMeta extends Record<string, unknown>>(
    kind: TKind,
    input: TInput,
    output: TOutput,
    meta: TMeta,
  ): SolverFactoryOutput<TKind, TInput, TOutput, TMeta & { readonly confidence: 0.5 }>;
  <TKind extends string, TInput, TOutput, TMeta extends Record<string, unknown>, TContext extends Record<string, unknown>>(
    kind: TKind,
    input: TInput,
    output: TOutput,
    meta: TMeta,
    context: TContext,
  ): SolverFactoryOutput<TKind, TInput, TOutput, { readonly confidence: 0.5; readonly context: TContext } & TMeta>;
  <TKind extends string, TInput, TOutput, TConfig extends string>(
    kind: TKind,
    input: TInput,
    output: TOutput,
    config: { readonly retries: number },
    marker: Branded<TConfig, 'FactoryConfig'>,
  ): SolverFactoryOutput<
    TKind,
    TInput,
    TOutput,
    { readonly confidence: 0.5; readonly retries: number; readonly marker: TConfig }
  >;
};

type InferredMeta<TMeta extends Record<string, unknown>, TContext extends Record<string, unknown>> =
  TMeta & { readonly confidence: 0.5; readonly context?: TContext };

export const buildSolverFactory = <
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TConfig extends string = string,
>(
  kind: TKind,
  input: TInput,
  output: TOutput,
  metaOrConfig?: TMeta | { readonly retries: number },
  contextOrMarker?: TContext | Branded<TConfig, 'FactoryConfig'>,
): SolverFactoryOutput<TKind, TInput, TOutput, InferredMeta<TMeta, TContext>> => {
  const config =
    metaOrConfig && typeof metaOrConfig === 'object' && 'retries' in metaOrConfig
      ? (metaOrConfig as { readonly retries: number })
      : undefined;

  const context =
    contextOrMarker && typeof contextOrMarker === 'object' && !('__brand' in contextOrMarker)
      ? (contextOrMarker as TContext)
      : undefined;

  const marker =
    contextOrMarker && typeof contextOrMarker === 'object' && '__brand' in contextOrMarker
      ? (contextOrMarker as Branded<TConfig, 'FactoryConfig'>).value
      : undefined;

  const meta =
    metaOrConfig && typeof metaOrConfig === 'object' && !('retries' in metaOrConfig)
      ? (metaOrConfig as Record<string, unknown>)
      : {};

  return {
    kind,
    input,
    output,
    meta: {
      ...(meta ?? {}),
      ...(context ? { context } : {}),
      confidence: 0.5,
      createdAt: new Date().toISOString(),
      ...(config ? { retries: config.retries } : {}),
      ...(marker ? { marker } : {}),
    },
  } as unknown as SolverFactoryOutput<TKind, TInput, TOutput, InferredMeta<TMeta, TContext>>;
};

export const buildSolverInvocation = <
  K extends string,
  I,
  O,
>(
  factory: SolverFactoryOutput<K, I, O, Record<string, unknown>>,
  guard: (input: I) => boolean,
): SolverInvocation<K, I, O> => ({
  kind: factory.kind,
  input: factory.input,
  output: factory.output,
  execute: async (input: I) => {
    if (!guard(input)) {
      return factory.output;
    }
    return factory.output;
  },
});

type ChainState<
  TKind extends string,
  TInput,
  TOutput,
  TMeta extends Record<string, unknown>,
> = {
  readonly stage: TKind;
  readonly input: TInput;
  readonly output: TOutput;
  readonly meta: TMeta;
  readonly next?: ChainState<TKind, TInput, TOutput, TMeta>;
};

export type ChainMap = Record<string, unknown>;
export type SolverBundle<T extends ChainMap> = {
  readonly entries: readonly SolverFactoryOutput<string, unknown, unknown, Record<string, unknown>>[];
  readonly map: T;
  readonly checksum: number;
};

export const makeInvocationBundleFromInstances = <
  T extends readonly SolverFactoryOutput<string, unknown, unknown, Record<string, unknown>>[],
>(
  entries: T,
): SolverBundle<{ readonly count: T['length'] }> => {
  const checksum = entries.reduce((acc, entry) => acc + String(entry.kind).length, 0);
  const map = { count: entries.length } as { readonly count: T['length'] };
  return { entries, map, checksum };
};

export const expandFactoryChain = (
  entries: readonly SolverFactoryOutput<string, unknown, unknown, Record<string, unknown>>[],
) => {
  const reversed = [...entries].reverse();
  let current: ChainState<string, unknown, unknown, Record<string, unknown>> | undefined;
  for (const entry of reversed) {
    current = {
      stage: entry.kind,
      input: entry.input,
      output: entry.output,
      meta: entry.meta as Record<string, unknown>,
      next: current,
    };
  }
  return current as ChainState<string, unknown, unknown, Record<string, unknown>>;
};

const mkOutput = <T>(value: T): T => value;
const mkMeta = <T extends Record<string, unknown>>(meta: T): T => meta;

const factoryA = buildSolverFactory('discover', 12, mkOutput({ severity: 'critical' } as const), mkMeta({ ttl: 30, phase: 'probe' } as const));
const factoryB = buildSolverFactory('recover', 'incident-1', mkOutput({ state: 'recovered' } as const), mkMeta({ ttl: 40 }));
const factoryC = buildSolverFactory('triage', { level: 2 }, mkOutput({ route: 'triage' } as const), mkMeta({ ttl: 45 }));
const factoryD = buildSolverFactory('notify', ['alpha'], mkOutput({ sent: true } as const), mkMeta({ ttl: 50 }));
const factoryE = buildSolverFactory(
  'rollback',
  { tenant: 'tenant-x', reason: 'test' },
  mkOutput({ restored: false } as const),
  mkMeta({ ttl: 12 }),
  { priority: 'high' },
);
const factoryF = buildSolverFactory(
  'simulate',
  { domain: 'auth', verb: 'assess' },
  mkOutput(['ok'] as const),
  mkMeta({ ttl: 22, dryRun: true }),
  { mode: 'synthetic' },
);
const factoryG = buildSolverFactory('archive', 7, mkOutput([1, 2, 3] as const), { ttl: 99, immutable: true });
const factoryH = buildSolverFactory('compact', null, mkOutput('compact' as const), { ttl: 8 }, { partition: 3 } as Record<string, unknown>);

const noInferPayload = <TInput>(input: NoInfer<TInput>) => input;

export const solverInstances = [factoryA, factoryB, factoryC, factoryD, factoryE, factoryF, factoryG, factoryH].map(
  (entry) => entry as SolverFactoryOutput<string, unknown, unknown, Record<string, unknown>>,
);

export const invocationBundle = makeInvocationBundleFromInstances(solverInstances);

export const chainByTemplate = expandFactoryChain(solverInstances);
export const invokeSuite = solverInstances.map((entry) =>
  buildSolverInvocation(entry, (input) => String(input).length > 0),
);

export const invokeSuiteWithFallback = async () => {
  const outputs = await Promise.all(invokeSuite.map((invocation): Promise<unknown> => invocation.execute(invocation.input as never)));
  return outputs;
};

export const typedRouteDecisions = [...routeDecisions.values()].slice(0, 8).reduce((acc, decision, index) => {
  if (decision.decision === 'accept') {
    acc[index] = {
      decision: decision.decision,
      source: decision.source,
      depth: String(decision.depth),
      reason: decision.reason,
      path: decision.path,
      entity: decision.entity,
    };
  }
  return acc;
}, [] as Array<{ decision: 'accept'; source: string; depth: string; reason?: string; path: string; entity: string } | undefined>);

const routeIndexed = routeCatalog.get('/auth/discover/high/tenant-7f1');

export type SolverKindMatrix = ReturnType<typeof invokeSuiteWithFallback> extends Promise<infer T>
  ? (T extends readonly unknown[] ? T[number] : never)
  : never;

export type RouteDecisionMatrix = typeof typedRouteDecisions;

export const solverSignature = solverInstances.map((instance) => {
  const meta = instance.meta as Record<string, unknown>;
  const ttl = (meta.ttl as number | undefined) ?? 0;
  return `${instance.kind}:${ttl}`;
});

export function makeInvocationTuple<T extends readonly string[]>(...values: T): {
  readonly tuple: T;
  readonly size: T['length'];
  readonly joined: string;
} {
  return {
    tuple: values,
    size: values.length,
    joined: values.join(','),
  };
}

export const solverOverloadMatrix = [
  makeInvocationTuple('boot', 'collect', 'route'),
  makeInvocationTuple('drain', 'notify'),
  makeInvocationTuple('restore', 'verify', 'rollback', 'finalize'),
  makeInvocationTuple('snapshot', 'archive', 'compact'),
  makeInvocationTuple('simulate', 'restore', 'verify', 'migrate', 'close'),
];

export const invocationCatalog = {
  factories: solverInstances,
  invocations: invokeSuite,
  bundles: solverOverloadMatrix,
  checksum: solverInstances.length,
};

const dispatch = <TInput, TKind extends string>(
  kind: TKind,
  payload: TInput,
): {
  kind: TKind;
  payload: TInput;
  valid: boolean;
} => ({
  kind,
  payload,
  valid: payload != null,
});

export const dispatched = invokeSuite
  .flatMap((invocation) => [dispatch(invocation.kind, invocation.input), dispatch('generic', invocation.output as unknown)])
  .slice(0, 20);

export const mapByKind = (inputs: typeof dispatched) =>
  inputs.reduce((acc, item) => {
    const key = item.kind;
    const bucket = acc.get(key) ?? [];
    bucket.push(item);
    acc.set(key, bucket);
    return acc;
  }, new Map<string, typeof dispatched>());
