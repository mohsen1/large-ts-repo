import {
  atlasRouteCatalog,
  atlasRouteCatalogRoutes,
  type RecoveryCommand,
  type RecoveryDomain,
  type RecoveryRoute,
  type AtlasRouteEnvelope,
} from '@shared/type-level/stress-synthetic-atlas';
import { compileControlMatrix, type ControlMatrixInput, type ControlMatrixResult } from './compiler-control-matrix';
import { buildConstraintDecision, type ConstraintForgeInput } from './compiler-constraint-forge';

export interface ArenaSettings {
  readonly tenant: string;
  readonly domain: RecoveryDomain;
  readonly routeCount: number;
  readonly mode: ControlMatrixInput['mode'];
  readonly attempts: number;
}

export interface ArenaResult {
  readonly tenant: string;
  readonly routes: readonly RecoveryRoute[];
  readonly routeCount: number;
  readonly matrix: ControlMatrixResult;
  readonly trace: {
    readonly route: RecoveryRoute;
    readonly status: string;
    readonly command: RecoveryCommand;
    readonly envelope: AtlasRouteEnvelope;
  }[];
  readonly seed: number;
}

type ArenaMap = Partial<Record<RecoveryDomain, readonly RecoveryRoute[]>>;
type ArenaEnvelope = {
  readonly id: number;
  readonly domain: RecoveryDomain;
  readonly payload: string;
};

const arenaDisposer = Symbol('arena-dispose');

export const arenaCatalog = atlasRouteCatalog as unknown as ArenaMap;
const routeSeed = atlasRouteCatalogRoutes as readonly RecoveryRoute[];

export const makeArenaMap = (domain: RecoveryDomain): readonly RecoveryRoute[] => {
  const entries = atlasRouteCatalog[domain as keyof typeof atlasRouteCatalog] as readonly string[] | undefined;
  return entries
    ? entries
        .flatMap((command) => routeSeed.filter((route) => route.startsWith(`${command}:${domain}:`)))
        .slice() as readonly RecoveryRoute[]
    : [];
};

export const buildArenaRoutes = (settings: ArenaSettings): readonly RecoveryRoute[] => {
  const selected = makeArenaMap(settings.domain).slice(0, Math.max(1, settings.routeCount));
  const fallback = atlasRouteCatalogRoutes.slice(0, settings.routeCount) as RecoveryRoute[];
  const bucket = selected.length > 0 ? selected : fallback;
  return [...new Set(bucket)].slice(0, Math.max(1, settings.routeCount));
};

const resolveArenaEnvelope = (route: RecoveryRoute): AtlasRouteEnvelope => {
  const [command, domain, severity] = route.split(':');
  return {
    command,
    domain,
    severity,
    normalized: command,
  } as AtlasRouteEnvelope;
};

export const runConstraintArena = (
  payload: ConstraintForgeInput,
  route: RecoveryRoute,
): ArenaResult['trace'][number] => {
  const decision = buildConstraintDecision({
    tenant: payload.tenant,
    command: payload.command as RecoveryCommand,
    domain: payload.domain,
    routes: [route],
    dryRun: payload.dryRun,
  });

  return {
    route,
    status: decision.traces.at(-1)?.status ?? 'accepted',
    command: decision.input.command,
    envelope: resolveArenaEnvelope(route),
  };
};

export const runRouteArena = async (
  tenant: string,
  domain: RecoveryDomain,
  routeCount: number,
): Promise<ArenaResult> => {
  const settings: ArenaSettings = {
    tenant,
    domain,
    routeCount,
    mode: 'scan',
    attempts: 5,
  };

  const routes = buildArenaRoutes(settings);
  const matrix = compileControlMatrix({
    seed: routeCount,
    size: Math.max(4, Math.min(routeCount, 24)),
    mode: settings.mode,
  });

  const input: ConstraintForgeInput = {
    tenant,
    command: routes[0]?.split(':')[0] as RecoveryCommand,
    domain,
    routes,
    dryRun: true,
  };

  const trace: ArenaResult['trace'] = [];
  const resource: ArenaEnvelope & { [Symbol.dispose](): void } = {
    id: 0,
    domain,
    payload: `${tenant}:${domain}`,
    [Symbol.dispose]() {
      trace.length = 0;
    },
  };

  using _arena = resource;
  for (const route of routes) {
    trace.push(runConstraintArena(input, route));
  }

  try {
    return {
      tenant,
      routes,
      routeCount: routes.length,
      matrix,
      trace,
      seed: matrix.seed,
    };
  } finally {
    if (trace.length > settings.attempts) {
      trace.splice(settings.attempts);
    }
  }
};

export const routeArenaManifest = runRouteArena('tenant-arena', 'incident', 12);

const resolveAtlasCatalog = async () => {
  const manifest = await runRouteArena('tenant-arena', 'incident', 8);
  return manifest.trace.map((entry) => entry.route);
};

export const arenaSeedRoutes = resolveAtlasCatalog();

const arenaState = new Map<string, number>([
  ['incident', 1],
  ['fabric', 2],
  ['chronicle', 3],
  ['cockpit', 4],
]);

export const runRouteArenaSuite = async (
  domains: readonly RecoveryDomain[],
  attempts: number,
): Promise<readonly ArenaResult[]> => {
  const results: ArenaResult[] = [];
  let attempt = 0;
  for (const domain of domains) {
    attempt += 1;
    if (attempt > attempts) {
      break;
    }
    const routes = makeArenaMap(domain).length;
    const matrixSize = arenaState.get(domain) ?? 5;
    const result = await runRouteArena(`tenant-${domain}`, domain, Math.max(4, (routes % 18) + matrixSize));
    results.push(result);
  }
  return results;
};
