import type { Brand, PathValue, RecursiveMerge, NoInfer } from '@shared/type-level';

export type StreamDomain =
  | 'continuity'
  | 'fabric'
  | 'recovery'
  | 'chronicle'
  | 'incident'
  | 'telemetry'
  | 'policy'
  | 'scenario'
  | 'drill'
  | 'risk';

export type StreamAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'seal'
  | 'broadcast'
  | 'drain'
  | 'route'
  | 'elevate'
  | 'synchronize'
  | 'rollback'
  | 'reconcile'
  | 'snapshot'
  | 'commit'
  | 'revise'
  | 'escalate'
  | 'defer'
  | 'split'
  | 'merge'
  | 'observe'
  | 'synthesize'
  | 'quarantine'
  | 'provision'
  | 'release'
  | 'freeze'
  | 'throttle'
  | 'replay'
  | 'bind'
  | 'fork'
  | 'audit'
  | 'thaw';

export type StreamSeverity = 'critical' | 'high' | 'medium' | 'low' | 'trace' | 'debug' | 'info' | 'audit';

export type StreamEventCode = `${StreamDomain}:${StreamAction}:${StreamSeverity}`;

export interface StreamIdentity {
  readonly id: Brand<string, 'StreamId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly domain: StreamDomain;
}

export interface StreamEnvelopeBase {
  readonly timestamp: string;
  readonly severity: StreamSeverity;
  readonly tags: readonly string[];
}

export interface StreamPayloadMap {
  start: { reason: string; source: string };
  pause: { cause: 'manual' | 'policy' | 'timeout'; until?: string };
  resume: { coordinator: string; resumedFrom: string };
  route: { source: string; destination: string; weight: number };
  split: { segments: number; budget: number };
  merge: { joined: number; policy: 'hard' | 'soft' };
  snapshot: { snapshotRef: string; checkpoint: boolean };
  verify: { verifier: string; valid: boolean };
  replay: { replayCursor: number };
  release: { reason: string; scope: string };
  freeze: { reason: string; by: string };
  thaw: { level: 1 | 2 | 3 };
  throttle: { hardLimit: number };
  fork: { branch: string; seed: string };
  bind: { boundTo: string };
  audit: { actor: string; target: string };
  synchronize: { source: string; heartbeat: number };
  commit: { sequence: number; by: string };
  revise: { proposal: string; approved: boolean };
  reconcile: { upstream: string; conflicts: number };
  escalate: { owner: string; urgency: 'p1' | 'p2' | 'p3' };
  depr?: never;
  default: { action: string; value: string };
}

export type StreamPayloadByAction<A extends StreamAction> =
  A extends keyof StreamPayloadMap
    ? StreamPayloadMap[A]
    : StreamPayloadMap['default'];

export type StreamEnvelope<A extends StreamAction = StreamAction> =
  A extends StreamAction
    ? ({
        readonly action: A;
        readonly identity: StreamIdentity;
        readonly payload: StreamPayloadByAction<A>;
      } & StreamEnvelopeBase)
    : never;

export type StreamBlueprintRoute = `/${StreamDomain}/${StreamAction}/${string}`;

export type BlueprintFromTemplate<T extends string> =
  T extends `/${infer D}/${infer A}/${infer I}`
    ? D extends StreamDomain
      ? A extends StreamAction
        ? {
            readonly domain: D;
            readonly action: A;
            readonly input: I;
            readonly raw: T;
          }
        : never
      : never
    : never;

export type RouteTemplateToPayload<T extends StreamBlueprintRoute> =
  T extends `/${StreamDomain}/${infer A}/${infer I}`
    ? A extends StreamAction
      ? { readonly action: A; readonly input: I; readonly route: T }
      : never
    : never;

export type RouteTemplates = readonly StreamBlueprintRoute[];

export type RouteTemplate = StreamBlueprintRoute;

export type StreamRouteBlueprint<T extends RouteTemplates = RouteTemplates> = BuildBlueprint<T>;

export type RouteBlueprint<T extends RouteTemplates = RouteTemplates> = StreamRouteBlueprint<T>;

export type BranchByToken<T extends StreamBlueprintRoute> = {
  readonly token: T extends `/${string}/${infer A}/${string}`
    ? A
    : never;
};

export type BlueprintCatalog<T extends RouteTemplates> = {
  readonly [K in keyof T as K extends number
    ? BlueprintKey<T[K] & string>
    : never]: {
    readonly template: T[K] & StreamBlueprintRoute;
    readonly payload: RouteTemplateToPayload<T[K] & StreamBlueprintRoute>;
  };
} & {
  readonly total: T['length'];
};

export type BlueprintKey<T extends string> =
  T extends `/${infer Domain}/${infer Action}/${infer _}`
    ? `${Domain & string}_${Action & string}`
    : 'invalid';

export type TemplateKeySet<T extends RouteTemplates> = {
  readonly [K in keyof T]: BlueprintKey<T[K] & string>;
};

export type ResolveActionByTemplate<T extends StreamBlueprintRoute> =
  T extends `/${string}/${infer A}/${string}`
    ? A extends StreamAction
      ? A
      : never
    : never;

export type BranchSelector<T> = T extends { readonly surface: infer S }
  ? S extends StreamDomain
    ? { readonly selected: true; readonly surface: S }
    : { readonly selected: false; readonly surface: 'fleet' }
  : { readonly selected: false; readonly surface: 'fleet' };

export interface EventNodeState {
  readonly id: string;
  readonly node: 'root' | 'leaf' | 'junction';
}

export interface EventNode<T extends StreamAction, P extends number = 0> extends EventNodeState {
  readonly action: T;
  readonly position: P;
  readonly envelope: StreamEnvelope<T>;
}

export type NumericCounter<N extends number, T extends unknown[] = []> =
  T['length'] extends N ? T : NumericCounter<N, [...T, T['length']] >;

export type StreamChain<T extends readonly StreamAction[], I extends unknown[] = []> =
  I['length'] extends T['length']
    ? { readonly done: true }
    : T extends readonly [...infer Prefix, ...infer Tail]
      ? Prefix extends []
        ? { readonly done: true }
        : T[I['length']] extends StreamAction
          ? {
              readonly kind: T[I['length']];
              readonly index: I['length'];
              readonly next: StreamChain<T, [...I, unknown]>;
            }
          : never
      : never;

export type ChainIndex<N extends number> =
  N extends 0
    ? 1
    : N extends 1
      ? 2
      : N extends 2
        ? 3
        : N extends 3
          ? 4
          : N extends 4
            ? 5
            : N extends 5
              ? 6
              : N extends 6
                ? 7
                : N extends 7
                  ? 8
                  : N extends 8
                    ? 9
                    : N extends 9
                      ? 10
                      : never;

export type BuildBranchPath<T extends readonly StreamBlueprintRoute[]> = {
  readonly [K in keyof T]: {
    readonly route: T[K];
    readonly parsed: BlueprintFromTemplate<T[K] & string>;
    readonly depth: K & number;
  };
};

export type MappedBlueprintPayload<T> = T extends { readonly action: infer A }
  ? A extends StreamAction
    ? StreamPayloadByAction<A>
    : never
  : never;

export type BlueprintRemap<T extends object> = {
  readonly [K in keyof T as K extends `__${string}` ? never : `stream_${K & string}`]: MappedBlueprintPayload<T[K] & { readonly action: StreamAction }>;
};

export type DeepTemplateRemap<T> = {
  readonly [K in keyof T]: T[K] extends object
    ? DeepTemplateRemap<T[K]>
    : T[K];
};

export type ActionDiscriminator<T extends StreamAction> =
  T extends 'start'
    ? { readonly label: 'begin'; readonly kind: 'warm'; readonly action: T }
    : T extends 'pause' | 'throttle'
      ? { readonly label: 'hold'; readonly kind: 'cold'; readonly action: T }
      : T extends 'resume' | 'release' | 'thaw'
        ? { readonly label: 'continue'; readonly kind: 'heat'; readonly action: T }
        : { readonly label: 'steady'; readonly kind: 'normal'; readonly action: T };

export type RouteActionMap<T extends StreamBlueprintRoute> =
  T extends `/${infer D}/${infer A}/${infer _}`
    ? {
        readonly domain: D;
        readonly discriminant: A;
        readonly action: A extends StreamAction ? A : never;
      }
    : { readonly domain: 'continuity'; readonly discriminant: 'start'; readonly action: 'start' };

export type ParseRouteToken<T extends StreamBlueprintRoute> =
  T extends `/${string}/${infer A}/${infer B}`
    ? A extends StreamAction
      ? `${A}-${B}`
      : `unknown-${string & T}`
    : 'invalid';

export type RouteInputSet<T extends RouteTemplates> = {
  readonly byRoute: {
    [K in keyof T as ParseRouteToken<T[K] & StreamBlueprintRoute>]: RouteTemplateToPayload<T[K] & StreamBlueprintRoute>;
  };
  readonly indexes: NumericCounter<T['length']>;
};

export type ChainState<T extends StreamBlueprintRoute[]> = {
  readonly routeMap: BuildBranchPath<T>;
  readonly actionSet: {
    readonly [K in keyof T]: T[K] & StreamAction;
  };
  readonly counters: NumericCounter<T['length']>;
};

export type BlueprintEnvelope<T extends StreamBlueprintRoute> =
  T extends `/${string}/${infer A}/${infer B}`
    ? StreamEnvelope<A & StreamAction> & {
        readonly blueprintKey: `bp:${BlueprintKey<T>}`;
        readonly blueprintInput: B;
      }
    : never;

export type RouteLineage<T extends StreamBlueprintRoute[]> = {
  readonly start: {
    readonly kind: 'start';
    readonly next: ChainState<T>;
  };
  readonly items: BuildBlueprint<T>;
};

export type BuildBlueprint<T extends RouteTemplates> = {
  readonly catalog: BlueprintCatalog<T>;
  readonly chains: BuildBranchPath<T>;
  readonly tokens: {
    readonly [K in keyof T]: ParseRouteToken<T[K] & string>;
  };
  readonly union: {
    readonly [K in T[number]]: BlueprintFromTemplate<K>;
  };
};

export type BlueprintTemplateConstraint<T extends StreamBlueprintRoute> =
  T extends StreamBlueprintRoute ? true : false;

export type RecursiveTemplateMap<T extends RouteTemplates, A extends unknown[] = []> =
  A['length'] extends 4
    ? T[number]
    : RecursiveTemplateMap<T, [...A, { readonly slot: T[A['length'] & number] }]>;

export const streamRouteTemplates = [
  '/recovery/start/session',
  '/recovery/pause/session',
  '/recovery/resume/session',
  '/fabric/route/edge',
  '/fabric/merge/line',
  '/chronicle/observe/snapshot',
  '/incident/escalate/event',
  '/telemetry/replay/log',
  '/policy/revise/rule',
  '/scenario/replay/sim',
  '/risk/freeze/plan',
  '/drill/release/plan',
  '/fabric/split/branch',
  '/continuity/audit/log',
  '/risk/throttle/zone',
  '/incident/replay/archive',
] as const satisfies RouteTemplates;

export const buildBlueprint = <T extends RouteTemplates>(templates: [...T]): BuildBlueprint<T> => {
  for (const template of templates) {
    // no-op to keep template iteration side effects
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    template;
  }

  return {
    catalog: templates.reduce((acc, template) => {
      const parsed = parseBlueprint(template);
      const key = `${parsed.domain}_${parsed.action}` as BlueprintKey<typeof template>;
      (acc as any)[key] = {
        template,
        payload: parsed,
      };
      return acc;
    }, {} as BlueprintCatalog<T>),
    chains: templates.map((template, index) => ({
      route: template,
      parsed: parseBlueprint(template) as BlueprintFromTemplate<typeof template>,
      index,
    })) as unknown as BuildBranchPath<T>,
    tokens: templates.map((template) => parseRouteToken(template)) as {
      [K in keyof T]: ParseRouteToken<T[K] & string>;
    },
    union: {} as {
      [K in T[number]]: BlueprintFromTemplate<K>;
    },
  };
};

export const parseBlueprint = <T extends StreamBlueprintRoute>(template: T): BlueprintFromTemplate<T> => {
  const [, domain, action, ...rest] = template.split('/');
  return {
    domain: domain as StreamDomain,
    action: action as StreamAction,
    input: rest.join('/'),
    raw: template,
  } as BlueprintFromTemplate<T>;
};

export const parseRouteToken = <T extends StreamBlueprintRoute>(template: T): ParseRouteToken<T> => {
  const [, , action, input] = template.split('/');
  return `${action}-${input}` as ParseRouteToken<T>;
};

export const enrichRouteBlueprint = <T extends StreamBlueprintRoute>(template: T): RouteTemplateToPayload<T> => {
  const [domain, action, ...inputParts] = template.split('/').slice(1);
  return {
    action: action as any,
    input: inputParts.join('/'),
    route: template,
  } as RouteTemplateToPayload<T>;
};

export const withRecursionTemplate = <T extends RouteTemplates>(templates: [...T]): {
  readonly chain: StreamChain<readonly ResolveActionByTemplate<T[number]>[]>;
  readonly recursion: RecursiveTemplateMap<T>;
} => {
  const normalized = templates
    .map((template) => parseBlueprint(template as StreamBlueprintRoute).action as StreamAction | never)
    .filter((value): value is StreamAction => value !== 'route' && value !== undefined);

  return {
    chain: {
      kind: normalized[0] ?? 'start',
      index: 0,
      next: { kind: 'pause', index: 1, next: { done: true } as never },
    } as unknown as StreamChain<readonly ResolveActionByTemplate<T[number]>[]>,
    recursion: (normalized as unknown) as RecursiveTemplateMap<T>,
  };
};

export const routeBlueprintPayloads = <T extends StreamBlueprintRoute>(
  input: T,
): BlueprintEnvelope<T> => {
  const parsed = parseBlueprint(input);
  const envelope: StreamEnvelope<'start'> = {
    action: 'start',
    identity: {
      id: 'seed' as Brand<string, 'StreamId'>,
      tenant: 'tenant-default' as Brand<string, 'TenantId'>,
      domain: parsed.domain as StreamDomain,
    },
    payload: {
      reason: 'seed',
      source: 'seed',
    } as StreamPayloadByAction<'start'>,
    timestamp: new Date().toISOString(),
    severity: 'info',
    tags: ['seed'],
  };

  return {
    ...envelope,
    blueprintKey: `bp:${parsed.domain}_${parsed.action}`,
    blueprintInput: parsed.input,
  } as BlueprintEnvelope<T>;
};

export const resolveBlueprintPath = <T extends object, P extends string>(
  root: T,
  path: NoInfer<P>,
): PathValue<T, P> => {
  const segments = path.split('.');
  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor != null && typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[segment];
    }
  }
  return cursor as PathValue<T, P>;
};

export const mergeBlueprints = <A extends object, B extends object>(
  left: A,
  right: B,
): RecursiveMerge<DeepTemplateRemap<A>, DeepTemplateRemap<B>> => {
  return {
    ...(left as object),
    ...(right as object),
  } as RecursiveMerge<DeepTemplateRemap<A>, DeepTemplateRemap<B>>;
};
