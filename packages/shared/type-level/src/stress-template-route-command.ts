export type CommandDomain =
  | 'incident'
  | 'workload'
  | 'timeline'
  | 'policy'
  | 'fabric'
  | 'forecast'
  | 'signal'
  | 'mesh'
  | 'registry'
  | 'runtime';

export type CommandAction =
  | 'discover'
  | 'assess'
  | 'dispatch'
  | 'stabilize'
  | 'rollback'
  | 'observe'
  | 'plan'
  | 'simulate'
  | 'audit'
  | 'reconcile'
  | 'migrate'
  | 'escalate';

export type CommandId = `${string & Uppercase<string>}${number}`;

export type CommandRoute = `/${string}`;

export type ParsedCommandEntity<T extends CommandDomain> = {
  readonly kind: T;
  readonly layer: number;
};

export type CommandEntityMap<T extends CommandRoute> = {
  readonly entity: ParsedCommandEntity<CommandDomain>;
  readonly action: CommandAction;
  readonly id: string;
  readonly raw: T;
};

export type RouteVerb<T extends CommandRoute> = ResolveVerbAction<CommandAction>;

export type ResolveVerbAction<T extends CommandAction> = T extends 'discover'
  ? { kind: 'read'; phase: 'discover'; timeoutSec: 3; canRetry: true }
  : T extends 'assess'
    ? { kind: 'read'; phase: 'assess'; timeoutSec: 7; canRetry: true }
    : T extends 'dispatch'
      ? { kind: 'write'; phase: 'dispatch'; timeoutSec: 30; canRetry: false }
      : T extends 'stabilize'
        ? { kind: 'control'; phase: 'stabilize'; timeoutSec: 120; canRetry: false }
        : T extends 'rollback'
          ? { kind: 'control'; phase: 'rollback'; timeoutSec: 300; canRetry: true }
          : T extends 'observe'
            ? { kind: 'read'; phase: 'observe'; timeoutSec: 10; canRetry: true }
            : T extends 'plan'
              ? { kind: 'write'; phase: 'plan'; timeoutSec: 20; canRetry: true }
              : T extends 'simulate'
                ? { kind: 'control'; phase: 'simulate'; timeoutSec: 45; canRetry: true }
                : T extends 'audit'
                  ? { kind: 'read'; phase: 'audit'; timeoutSec: 15; canRetry: true }
                  : T extends 'reconcile'
                    ? { kind: 'control'; phase: 'reconcile'; timeoutSec: 90; canRetry: false }
                    : T extends 'migrate'
                      ? { kind: 'write'; phase: 'migrate'; timeoutSec: 120; canRetry: false }
                      : { kind: 'write'; phase: 'escalate'; timeoutSec: 240; canRetry: true };

export type RouteMeta<T extends CommandRoute> = {
  readonly key: string;
  readonly verb: RouteVerb<T>;
  readonly index: CommandDomain;
};

export type RouteNetwork<T extends readonly CommandRoute[]> = {
  [K in keyof T & number as T[K] & string]: RouteMeta<T[K]>;
};

export type CommandIndex<T extends CommandRoute> = {
  readonly domain: CommandDomain;
  readonly action: CommandAction;
  readonly id: string;
};

export type RouteEnvelope<T extends CommandRoute> = CommandIndex<T> & RouteMeta<T>;

export type ParseUnion<T extends CommandRoute> = T extends any
  ? CommandEntityMap<T> & RouteMeta<T> & RouteVerb<T>
  : never;

export const commandUniverse = [
  '/incident/discover/AB001',
  '/workload/assess/CD002',
  '/timeline/dispatch/EF003',
  '/policy/stabilize/GH004',
  '/fabric/rollback/IJ005',
  '/forecast/observe/KL006',
  '/signal/plan/MN007',
  '/mesh/simulate/OP008',
  '/registry/audit/QR009',
  '/runtime/reconcile/ST010',
  '/runtime/migrate/UV011',
  '/runtime/escalate/WX012',
] as const satisfies readonly CommandRoute[];

export type CommandCatalog = RouteNetwork<typeof commandUniverse>;

export type RoutePayload<T extends CommandRoute> = {
  readonly raw: T;
  readonly parsed: CommandEntityMap<T>;
  readonly verb: RouteVerb<T>;
  readonly meta: RouteMeta<T>;
};

export type RouteCatalogByVerb<T extends CommandAction> = {
  [K in typeof commandUniverse[number] as K extends `/${string}/${T}/${string}` ? K : never]: RoutePayload<K>;
};

export type CommandParser<T extends string> = T extends `${infer A}/${infer B}`
  ? T extends `/${string}`
    ? RoutePayload<`/${CommandDomain}/${CommandAction}/${CommandId}`>
    : T extends '/'
      ? never
      : never
  : never;

export const parseCommandRoute = <T extends CommandRoute>(route: T): CommandEntityMap<T> => {
  const [, domain, action, id] = route.split('/') as [string, CommandDomain, CommandAction, CommandId];

  const domainProfile: Record<CommandDomain, ReturnType<typeof resolveDomain>> = {
    incident: { kind: 'incident', layer: 1 },
    workload: { kind: 'workload', layer: 2 },
    timeline: { kind: 'timeline', layer: 3 },
    policy: { kind: 'policy', layer: 4 },
    fabric: { kind: 'fabric', layer: 5 },
    forecast: { kind: 'forecast', layer: 6 },
    signal: { kind: 'signal', layer: 7 },
    mesh: { kind: 'mesh', layer: 8 },
    registry: { kind: 'registry', layer: 9 },
    runtime: { kind: 'runtime', layer: 10 },
  };

  return {
    entity: domainProfile[domain],
    action,
    id,
    raw: route,
  } as unknown as CommandEntityMap<T>;
};

export const routeCatalog = (): {
  readonly [K in typeof commandUniverse[number]]: RoutePayload<K>
} => {
  const out = commandUniverse.reduce((acc, route) => {
    const parsed = parseCommandRoute(route);
    const verb = parseVerb(route);
    const meta = resolveMeta(route, verb);
    acc[route] = {
      raw: route,
      parsed,
      verb,
      meta,
    } as never;
    return acc;
  }, {} as { [K in typeof commandUniverse[number]]: RoutePayload<K> });

  return out;
};

const resolveDomain = (value: CommandDomain): { kind: CommandDomain; layer: number } => {
  return { kind: value, layer: value.length };
};

const parseVerb = <T extends CommandRoute>(route: T): RouteVerb<T> => {
  const [, , action] = route.split('/') as [string, CommandDomain, CommandAction, CommandId];

  if (action === 'discover') {
    return { kind: 'read', phase: 'discover', timeoutSec: 3, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'assess') {
    return { kind: 'read', phase: 'assess', timeoutSec: 7, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'dispatch') {
    return { kind: 'write', phase: 'dispatch', timeoutSec: 30, canRetry: false } as unknown as RouteVerb<T>;
  }
  if (action === 'stabilize') {
    return { kind: 'control', phase: 'stabilize', timeoutSec: 120, canRetry: false } as unknown as RouteVerb<T>;
  }
  if (action === 'rollback') {
    return { kind: 'control', phase: 'rollback', timeoutSec: 300, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'observe') {
    return { kind: 'read', phase: 'observe', timeoutSec: 10, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'plan') {
    return { kind: 'write', phase: 'plan', timeoutSec: 20, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'simulate') {
    return { kind: 'control', phase: 'simulate', timeoutSec: 45, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'audit') {
    return { kind: 'read', phase: 'audit', timeoutSec: 15, canRetry: true } as unknown as RouteVerb<T>;
  }
  if (action === 'reconcile') {
    return { kind: 'control', phase: 'reconcile', timeoutSec: 90, canRetry: false } as unknown as RouteVerb<T>;
  }
  if (action === 'migrate') {
    return { kind: 'write', phase: 'migrate', timeoutSec: 120, canRetry: false } as unknown as RouteVerb<T>;
  }
  return { kind: 'write', phase: 'escalate', timeoutSec: 240, canRetry: true } as unknown as RouteVerb<T>;
};

export const resolveMeta = <T extends CommandRoute>(route: T, verb: RouteVerb<T>): RouteMeta<T> => {
  const parsed = parseCommandRoute(route);
  const raw = `${String(parsed.entity.kind)}:${String((verb as { phase: string }).phase)}`;
  return {
    key: raw as RouteMeta<T>["key"],
    verb,
    index: parsed.entity.kind,
  } as unknown as RouteMeta<T>;
};
