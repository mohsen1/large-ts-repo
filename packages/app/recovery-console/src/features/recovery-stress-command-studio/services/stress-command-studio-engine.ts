import type {
  StressStudioBuckets,
  StressCommandMode,
  RouteCommand,
  RouteCommandEnvelope,
  StressStudioResult,
  StressStudioRuntimeState,
  StressCommandRoute,
} from '../types';
import type { Brand } from '@shared/type-level';
import {
  stressRouteCatalog,
  parseRoute,
  type RouteMetaUnion,
} from '@shared/type-level/stress-orchestrator-mesh';

export type StudioCommandRecord = Readonly<{
  readonly route: StressCommandRoute;
  readonly command: string;
  readonly mode: StressCommandMode;
}>;

const defaultManifest = {
  tenant: 'tenant-stress-command-studio',
  includeReplay: true,
  includeBackfill: true,
  includeForecast: false,
} as const;

const loadManifest = () =>
  Promise.resolve({
    version: '1.0.0',
    tenant: defaultManifest.tenant,
    routes: stressRouteCatalog,
    modes: ['configure', 'inspect', 'simulate', 'execute', 'review', 'archive'] as const,
  });

export const studioManifestPromise = loadManifest();

const mapRouteToCommand = (route: StressCommandRoute, index: number): RouteCommand => ({
  id: `cmd-${String(index).padStart(3, '0')}` as `cmd-${string}`,
  route,
  mode: index % 6 === 0 ? 'execute' : index % 3 === 0 ? 'simulate' : 'inspect',
  priority: ((index * 13) % 10) + 1,
  tags: [route.split('/')[1], route.split('/')[3], String(index)],
});

export const buildStudioCommands = (count: number): readonly RouteCommand[] => {
  const commands: RouteCommand[] = [];
  for (let index = 0; index < count; index += 1) {
    const route = stressRouteCatalog[index % stressRouteCatalog.length] as StressCommandRoute;
    commands.push(mapRouteToCommand(route, index));
  }
  return commands;
};

const classifySeverity = (route: StressCommandRoute): 'low' | 'medium' | 'high' | 'critical' => {
  const parsed = parseRoute(route);
  if (parsed.parse.severity === 'critical') return 'critical';
  if (parsed.parse.severity === 'high') return 'high';
  if (parsed.parse.severity === 'moderate' || parsed.parse.severity === 'observability') return 'medium';
  return 'low';
};

export const dispatchBucketsFromCommands = (commands: readonly RouteCommand[]): StressStudioBuckets => {
  const low_bucket: Array<{ readonly command: string; readonly route: StressCommandRoute; readonly routeDensity: number }> = [];
  const medium_bucket: Array<{ readonly command: string; readonly route: StressCommandRoute; readonly routeDensity: number }> = [];
  const high_bucket: Array<{ readonly command: string; readonly route: StressCommandRoute; readonly routeDensity: number }> = [];
  const urgent_bucket: Array<{ readonly command: string; readonly route: StressCommandRoute; readonly routeDensity: number }> = [];

  for (const command of commands) {
    const severity = classifySeverity(command.route);
    const bucket = {
      command: command.id,
      route: command.route,
      routeDensity: command.route.length,
    };

    if (severity === 'critical') {
      urgent_bucket.push(bucket);
      continue;
    }

    if (severity === 'high') {
      high_bucket.push(bucket);
      continue;
    }

    if (severity === 'medium') {
      medium_bucket.push(bucket);
      continue;
    }

    low_bucket.push(bucket);
  }

  return { low_bucket, medium_bucket, high_bucket, urgent_bucket } as const;
};

export const buildRouteEnvelope = (command: RouteCommand): RouteCommandEnvelope => {
  return {
    command,
    createdAt: new Date(),
    payload: {
      id: command.id,
      tags: command.tags,
      mode: command.mode,
      routeProfile: parseRoute(command.route),
    },
  };
};

export const withStudioStack = async <T>(operations: () => Promise<T>): Promise<T> => {
  const AsyncDisposableStackCtor = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStack })
    .AsyncDisposableStack;
  if (!AsyncDisposableStackCtor) {
    return operations();
  }

  const stack = new AsyncDisposableStackCtor();
  if (!stack) {
    return operations();
  }

  try {
    await using _scope = stack;
    const result = await operations();
    return result;
  } finally {
    const disposer = (stack as { [Symbol.dispose]?: () => void })[Symbol.dispose];
    if (typeof disposer === 'function') {
      disposer.call(stack);
    }
  }
};

export const executeStudioPayload = async (
  tenant: string,
  commands: readonly RouteCommand[],
  mode: StressCommandMode,
): Promise<readonly StressStudioResult[]> => {
  return withStudioStack(async () => {
    const results = commands.map((command, index) => {
      const accepted = command.priority >= 4 && (mode !== 'configure' || index % 2 === 0);
      const status = accepted
        ? (mode === 'execute' || mode === 'review' ? 'applied' : 'queued')
        : 'idle';

      return {
        route: command.route,
        accepted,
        status,
        message: `${tenant}:${command.id}:${status}`,
      } as StressStudioResult;
    });

    return results;
  });
};

export const resolveRouteChain = <T extends StressCommandRoute>(route: T): RouteMetaUnion => {
  const parsed = parseRoute(route);
  return {
    route,
    resolved: parsed,
    chain: {
      key: 'depth-4',
      source: route,
      next: {
        key: 'depth-3',
        source: route,
        next: {
          key: 'depth-2',
          source: route,
          next: {
            key: 'depth-1',
            source: route,
            next: '/agent/discover/live/low' as StressCommandRoute,
          },
        },
      },
    },
  } as unknown as RouteMetaUnion;
};

export const commandWorkspaceState = (tenant: string): StressStudioRuntimeState => {
  const commands = buildStudioCommands(36);
  const commandSet = new Set(commands.map((command) => command.id));
  const routeDensity = commandSet.size / Math.max(1, commands.length);

  return {
    tenant,
    running: true,
    runId: `run-${tenant}-${routeDensity.toFixed(2)}`,
    refreshToken: Date.now(),
    commands,
    mode: 'configure',
    progress: Math.round(routeDensity * 100),
  };
};

const defaultModeTransition = {
  configure: 'inspect',
  inspect: 'simulate',
  simulate: 'execute',
  execute: 'review',
  review: 'archive',
  archive: 'configure',
} as const;

export const nextStudioMode = (current: StressCommandMode): StressCommandMode =>
  defaultModeTransition[current] as StressCommandMode;

export const dispatchStudioCommandTrace = withStudioStack(async () => {
  const tenant = defaultManifest.tenant as string;
  const state = commandWorkspaceState(tenant);
  const results = await executeStudioPayload(
    tenant,
    state.commands,
    'execute',
  );

  return {
    tenant,
    state,
    manifest: studioManifestPromise,
    chain: resolveRouteChain('/agent/discover/live/low' as StressCommandRoute),
    results,
  };
});
