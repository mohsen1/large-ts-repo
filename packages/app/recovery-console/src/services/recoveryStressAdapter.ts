import {
  type BranchByToken,
  type RouteBlueprint as StreamRouteBlueprint,
  type RouteTemplate,
  type RouteTemplates,
  type RouteTemplateToPayload,
  type StreamBlueprintRoute,
  type StreamEnvelope,
  type StreamPayloadByAction,
  buildBlueprint,
  buildConstraintGraph,
  streamRouteTemplates,
  parseBlueprint,
  type ConstraintGraph,
  type SolverVerb,
  type SolverRouteState,
} from '@shared/type-level-composition';
import { type Brand } from '@shared/type-level';

export type StressSessionState = 'idle' | 'collecting' | 'resolving' | 'dispatching' | 'closing';

export type StressScope = {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly requestId: Brand<string, 'RequestId'>;
};

export interface StressAdapterEvent {
  readonly at: number;
  readonly kind: 'enqueued' | 'resolved' | 'dispatched' | 'error';
  readonly text: string;
}

export type BranchPayload<T extends string = string> = {
  readonly active: boolean;
  readonly kind: T;
  readonly raw?: string;
  readonly prefix?: string;
};

export type StressAdapterState = {
  readonly session: StressSessionState;
  readonly routeCount: number;
  readonly diagnostics: readonly StressAdapterEvent[];
  readonly catalog: StreamRouteBlueprint<typeof routeTemplates>;
  readonly resolved: {
    readonly map: {
      [K in Extract<keyof typeof routeTemplates, number>]: RouteTemplateToPayload<(typeof routeTemplates)[K]>;
    };
  };
};

export type Disposables = {
  readonly registry: Set<symbol>;
  readonly stack: AsyncDisposableStack;
};

export const routeTemplates = [
  '/recovery/start/session',
  '/recovery/pause/session',
  '/recovery/resume/session',
  '/recovery/snapshot/session',
  '/recovery/throttle/session',
  '/recovery/split/session',
  '/recovery/observe/session',
  '/recovery/audit/session',
  '/recovery/route/session',
  '/recovery/rollback/session',
  '/recovery/replay/session',
] as const satisfies RouteTemplates;

export type RecoveryRouteTemplate = (typeof routeTemplates)[number];

export const isRecoveryRouteTemplate = (template: string): template is RecoveryRouteTemplate => {
  return template.startsWith('/recovery/');
};

export const recoveryRouteTemplates = routeTemplates.slice();

export type RouteConstraintSet = readonly {
  readonly solver: string;
  readonly phase: 'draft' | 'commit' | 'apply';
  readonly retries: number;
  readonly limit: number;
}[];

export const routeConstraintSet = [
  { solver: 'scalar', phase: 'draft', retries: 2, limit: 128 },
  { solver: 'mapped', phase: 'commit', retries: 5, limit: 256 },
  { solver: 'tuple', phase: 'apply', retries: 3, limit: 512 },
] as const satisfies RouteConstraintSet;

export type AppConstraintGraph = ConstraintGraph<readonly [
  'validate',
  'infer',
  'resolve',
  'merge',
  'accumulate',
  'dispatch',
  'throttle',
  'enforce',
  'report',
  'replay',
]>;

export const createConstraintGraph = (): AppConstraintGraph => {
  return buildConstraintGraph([
    'validate',
    'infer',
    'resolve',
    'merge',
    'accumulate',
    'dispatch',
    'throttle',
    'enforce',
    'report',
    'replay',
  ] as const);
};

export const parseRouteLine = (line: string): [string, string] => {
  const [, domain = 'recovery', action = 'start'] = line.split('/').filter(Boolean);
  return [domain, action];
};

export const hydrateBlueprint = <T extends RouteTemplates>(templates: T): StreamRouteBlueprint<T> =>
  buildBlueprint(templates as [...T]);

export const withDisposableFixture = async <T>(fn: (stack: AsyncDisposableStack) => Promise<T>): Promise<T> => {
  const stack = new AsyncDisposableStack();
  const guard = {
    [Symbol.asyncDispose]: async () => {
      await Promise.resolve();
    },
  };
  stack.use(guard);
  try {
    return await fn(stack);
  } finally {
    await stack.disposeAsync();
  }
};

export const streamStressNodes = (blueprint: StreamRouteBlueprint<typeof routeTemplates>): Map<`/${string}`, { readonly catalog: typeof blueprint.catalog; readonly total: number }> => {
  const records = new Map<`/${string}`, { readonly catalog: typeof blueprint.catalog; readonly total: number }>();
  for (const key in blueprint.catalog) {
    const domain = key.split('_')[0];
    const route = routeTemplates.find((candidate) => candidate.includes(`/${domain}/`));
    if (!route) {
      continue;
    }
    records.set(route as `/${string}`, { catalog: blueprint.catalog, total: blueprint.catalog.total });
  }
  return records;
};

export const collectConstraintEvents = <T extends StressSessionState>(state: T): { readonly index: number; readonly active: boolean; readonly text: string }[] => {
  return Array.from({ length: 8 }).map((_, index) => ({
    index,
    active: state !== 'idle',
    text: `${state}-${index}`,
  }));
};

export const transitionByToken = (token: string): StressSessionState => {
  if (token.startsWith('start')) {
    return 'collecting';
  }
  if (token.includes('resolve')) {
    return 'resolving';
  }
  if (token.includes('dispatch')) {
    return 'dispatching';
  }
  if (token.includes('close') || token.includes('archive')) {
    return 'closing';
  }
  return 'idle';
};

export const createScope = (tenant: string): StressScope => ({
  tenant: tenant as Brand<string, 'TenantId'>,
  requestId: `${tenant}-request` as Brand<string, 'RequestId'>,
});

export const runStressDiagnostics = async () => {
  const scope = createScope('tenant');
  const blueprint = hydrateBlueprint(streamRouteTemplates);

  return withDisposableFixture(async () => {
    const events: StressAdapterEvent[] = [];
    const values = [...routeTemplates, '/telemetry/replay/log', '/fabric/route/edge', '/policy/revise/rule'];
    let step = 0;

    for (const value of values.values()) {
      const [domain, action] = parseRouteLine(value);
      const sessionState = transitionByToken(action);
      events.push({ at: Date.now() + step, kind: 'enqueued', text: `${domain}:${action}` });
      if (sessionState === 'resolving') {
        events.push({ at: Date.now() + step + 1, kind: 'resolved', text: `resolved:${value}` });
      }
      if (sessionState === 'dispatching') {
        events.push({ at: Date.now() + step + 2, kind: 'dispatched', text: `dispatch:${value}` });
      }
      if (step > 7) {
        events.push({ at: Date.now() + step + 3, kind: 'error', text: 'stress overflow' });
      }
      step += 1;
    }

    return {
      blueprint,
      scope,
      state: events.at(-1)?.kind === 'error' ? 'closing' : 'collecting',
      diagnostics: events,
      map: blueprint.catalog,
    };
  });
};

export const resolveConstraintEnvelope = <T extends StreamBlueprintRoute>(route: T):
  StreamEnvelope<RouteTemplateToPayload<T>['action'] & BranchByToken<T>['token']> => {
  const parsed = parseBlueprint(route);
  const envelope: StreamEnvelope<'start'> = {
    action: parsed.action as any,
    identity: {
      id: 'seed' as Brand<string, 'StreamId'>,
      tenant: 'tenant-default' as Brand<string, 'TenantId'>,
      domain: 'recovery',
    },
    payload: {
      reason: 'boot',
      source: 'console',
    } as StreamPayloadByAction<'start'>,
    timestamp: new Date().toISOString(),
    tags: ['recovery'],
    severity: 'info',
  };

  return envelope as StreamEnvelope<RouteTemplateToPayload<T>['action'] & BranchByToken<T>['token']>;
};

export type { ConstraintGraph, SolverVerb, SolverRouteState, StreamRouteBlueprint, RouteTemplate, RouteTemplates, RouteTemplateToPayload, StreamPayloadByAction, StreamBlueprintRoute, StreamEnvelope, BranchByToken };
export type RouteBlueprint<T extends RouteTemplates = RouteTemplates> = StreamRouteBlueprint<T>;
