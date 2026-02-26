import { defaultConfigs, dispatchBlueprint } from './compiler-bridge-hypermatrix';
import {
  galaxyDispatchMatrix,
  type GalaxyRoute,
  type RouteCatalog,
  parseRouteSignature,
  type RouteMap,
  galaxyCatalog,
  resolveGalaxy,
} from '@shared/type-level/stress-conditional-dispatch-galaxy';
import type { NoInfer } from '@shared/type-level';

export type RuntimeEnvelope<T extends GalaxyRoute> = {
  readonly id: Branded<T, 'RuntimeId'>;
  readonly route: T;
  readonly createdAt: Date;
  readonly payload: RouteMap<T>;
};

export type Branded<T, B extends string> = T & { readonly __brand: B };

export type RuntimeReport = {
  readonly checks: readonly string[];
  readonly invocations: number;
  readonly elapsedMs: number;
};

class RouteLease implements Disposable {
  readonly id: string;
  private closed = false;
  constructor(id: string) {
    this.id = id;
  }
  [Symbol.dispose](): void {
    this.closed = true;
  }
}

class AsyncRouteLease implements AsyncDisposable {
  readonly id: string;
  constructor(id: string) {
    this.id = id;
  }
  async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve();
  }
}

const createLease = (id: string): RouteLease => new RouteLease(id);

const createAsyncLease = (id: string): AsyncRouteLease => new AsyncRouteLease(id);

export const normalizeCatalog = (catalog: RouteCatalog): readonly GalaxyRoute[] => {
  return Object.values(catalog)
    .flatMap((group) => group)
    .filter((route): route is GalaxyRoute => route.startsWith('/'));
};

export const buildRuntimeEnvelope = <
  const T extends GalaxyRoute,
>(route: T, seed: NoInfer<number>): RuntimeEnvelope<T> => {
  const parsed = parseRouteSignature(route);
  return {
    id: `${route}-${seed}` as Branded<T, 'RuntimeId'>,
    route,
    createdAt: new Date(Date.now() + seed),
    payload: parsed,
  };
};

export const evaluateCatalog = async (input: RouteCatalog): Promise<RuntimeReport> => {
  const start = performance.now();
  const routes = normalizeCatalog(input);
  const leases = new Set<RouteLease>();

  using lease = createLease('runtime-global');

  const catalog = normalizeCatalog(galaxyCatalog);
  const allRoutes = [...routes, ...catalog] as const;
  const allRouteList = allRoutes as readonly GalaxyRoute[];
  const resolved = resolveGalaxy(allRouteList);

  const envelopes: RuntimeEnvelope<GalaxyRoute>[] = [];
  const disposables = new AsyncDisposableStack();

  try {
    const asyncStack = createAsyncLease('runtime-async');
    disposables.use(asyncStack);

    for (const route of allRoutes) {
      const env = buildRuntimeEnvelope(route, allRoutes.length);
      envelopes.push(env);
      leases.add(createLease(env.id));
      const parity = allRouteList.indexOf(route) % 2;
      if (parity === 0) {
        disposables.defer(() => {
          leases.delete(createLease(`${route}-${allRouteList.length}`));
        });
      }
    }

    const metrics = envelopes.map((entry) => `${entry.id}:${entry.payload.severity}`).slice(0, 3);

    if (metrics.length === 0) {
      throw new Error('no metrics');
    }

    return {
      checks: resolved.map((entry: { key: string; normalized: string }) => entry.key).slice(0, 25),
      invocations: envelopes.length,
      elapsedMs: performance.now() - start,
    };
  } finally {
    for (const envelope of leases) {
      void envelope[Symbol.dispose]();
    }
    await disposables.disposeAsync();
  }
};

export const runtimeAudit = async (): Promise<RuntimeReport> => {
  const report = await evaluateCatalog(galaxyCatalog);
  return {
    ...report,
    checks: [...report.checks, 'runtime-check-complete', `staged:${defaultConfigs.staged.tenant}`],
  };
};

export const auditBundle = runtimeAudit();

export const runtimeDispatch = dispatchBlueprint('live').dispatch.length;

export const stagedRoutes = galaxyDispatchMatrix.slice(0, 6) as readonly GalaxyRoute[];

export const stagedEnvelope = stagedRoutes.map((route: GalaxyRoute, index: number) => buildRuntimeEnvelope(route, index));

export const stagedSummary = {
  routeCount: stagedRoutes.length,
  envelopeCount: stagedEnvelope.length,
  routeHash: stagedEnvelope.map((entry: RuntimeEnvelope<GalaxyRoute>) => entry.id),
} as const;
