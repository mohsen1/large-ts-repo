export type RouteEntity =
  | 'agent'
  | 'mesh'
  | 'node'
  | 'pipeline'
  | 'policy'
  | 'planner'
  | 'observer'
  | 'dashboard'
  | 'playbook'
  | 'registry';

export type RouteAction =
  | 'discover'
  | 'ingest'
  | 'triage'
  | 'remediate'
  | 'recover'
  | 'rollback'
  | 'notify'
  | 'synthesize'
  | 'dispatch'
  | 'stabilize'
  | 'snapshot'
  | 'restore';

export type RouteVerb =
  | 'start'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'finalize'
  | 'audit'
  | 'quarantine'
  | 'observe'
  | 'throttle';

export type EntityAction<E extends RouteEntity, A extends RouteAction> = `${E}:${A}`;

export type RouteToken<E extends RouteEntity, A extends RouteAction, V extends RouteVerb> =
  `${E}/${A}/${V}/${number}`;

export interface RouteCatalogItem<E extends RouteEntity = RouteEntity, A extends RouteAction = RouteAction, V extends RouteVerb = RouteVerb> {
  readonly entity: E;
  readonly action: A;
  readonly verb: V;
  readonly token: RouteToken<E, A, V>;
  readonly priority: 'low' | 'medium' | 'high';
  readonly retries: number;
}

export type RouteUnion = {
  [E in RouteEntity]: {
    [A in RouteAction]: {
      [V in RouteVerb]: RouteCatalogItem<E, A, V>
    };
  };
}[RouteEntity][RouteAction][RouteVerb];

export type ParsedRoute<T extends string> = T extends `${infer Ent}/${infer Act}/${infer Ver}/${infer Id}`
  ? {
      readonly entity: Ent & RouteEntity;
      readonly action: Act & RouteAction;
      readonly verb: Ver & RouteVerb;
      readonly id: Id;
      readonly spec: `/${T}`;
    }
  : never;

export type RouteTemplate = `${RouteEntity}/${RouteAction}/${RouteVerb}/${string}`;
export type RouteDispatchMatrix = {
  readonly list: readonly ReturnType<typeof resolveRouteDispatch>[];
  readonly index: Record<string, ReturnType<typeof resolveRouteDispatch>>;
};

type RouteTemplateList = readonly RouteTemplate[];

export type RouteMapByEntity<T extends readonly RouteEntity[]> = {
  [K in T[number]]: {
    [A in RouteAction]: {
      [V in RouteVerb]: RouteCatalogItem<K, A, V>;
    };
  };
};

export type RouteSignatureMatrix = {
  [K in RouteEntity]: {
    readonly [A in RouteAction]: {
      readonly [V in RouteVerb]: RouteToken<K, A, V>;
    };
  };
};

export type RoutedTuples =
  RouteAction extends infer A
    ? A extends RouteAction
      ? RouteEntity extends infer E
        ? E extends RouteEntity
          ? RouteVerb extends infer V
            ? V extends RouteVerb
              ? readonly [E & RouteEntity, A & RouteAction, V & RouteVerb]
              : never
            : never
          : never
        : never
      : never
    : never;

export interface RouteProjection<T extends RouteUnion> {
  readonly entity: T['entity'];
  readonly action: T['action'];
  readonly verb: T['verb'];
}

export const routeCatalog: RouteCatalogItem[] = [] as unknown as RouteCatalogItem[];

export const buildCatalog = (entities: readonly RouteEntity[]): RouteSignatureMatrix => {
  const matrix = entities.reduce((acc, entity) => {
    const actions = {} as any;
    routeSignatureActions.forEach((action) => {
      const verbEntries = routeSignatureVerbs.reduce((memo, verb) => {
        memo[verb] = `${entity}/${action}/${verb}/${entity.length + action.length + verb.length}` as RouteToken<RouteEntity, RouteAction, RouteVerb>;
        return memo;
      }, {} as Record<RouteVerb, string>);
      actions[action] = verbEntries;
    });
    return { ...acc, [entity]: actions };
  }, {} as RouteSignatureMatrix);
  return matrix;
};

const routeSignatureActions: readonly RouteAction[] = [
  'discover',
  'ingest',
  'triage',
  'remediate',
  'recover',
  'rollback',
  'notify',
  'synthesize',
  'dispatch',
  'stabilize',
  'snapshot',
  'restore',
] as const;

const routeSignatureVerbs: readonly RouteVerb[] = ['start', 'stop', 'pause', 'resume', 'finalize', 'audit', 'quarantine', 'observe', 'throttle'];

export const buildRouteTuple = <
  E extends readonly RouteEntity[],
  A extends readonly RouteAction[],
  V extends readonly RouteVerb[],
>(entities: E, actions: A, verbs: V): readonly RouteToken<E[number], A[number], V[number]>[] => {
  const items: string[] = [];
  for (const entity of entities) {
    for (const action of actions) {
      for (const verb of verbs) {
        items.push(`${entity}/${action}/${verb}/${entity}-${action}-${verb}`);
      }
    }
  }
  return items as readonly RouteToken<E[number], A[number], V[number]>[];
};

export const parseRouteToken = <T extends string>(token: T): ParsedRoute<T> => {
  const [entity, action, verb, id] = token.split('/') as [RouteEntity, RouteAction, RouteVerb, string];
  return {
    entity,
    action,
    verb,
    id,
    spec: `/${token}`,
  } as ParsedRoute<T>;
};

const routeTemplateEntities = [
  'agent',
  'mesh',
  'node',
  'pipeline',
  'policy',
  'planner',
  'observer',
  'dashboard',
  'playbook',
  'registry',
] as const satisfies readonly RouteEntity[];

const routeTemplateActions = [
  'discover',
  'ingest',
  'triage',
  'remediate',
  'recover',
  'rollback',
  'notify',
  'synthesize',
] as const satisfies readonly RouteAction[];

const routeTemplateVerbs = ['start', 'stop', 'pause', 'resume', 'finalize', 'audit', 'quarantine'] as const satisfies readonly RouteVerb[];

export const routeTemplates = buildRouteTuple(
  routeTemplateEntities,
  routeTemplateActions,
  routeTemplateVerbs,
) as RouteTemplateList;

export const resolveRouteDispatch = <T extends RouteTemplate>(route: T) => {
  const parsed = parseRouteToken(route);
  return {
    envelope: {
      domain: String(parsed.entity),
      action: String(parsed.action),
      verb: String(parsed.verb),
      trace: `${parsed.spec}`,
      command: route,
    },
    parsed,
    severity: 'medium' as const,
  };
};

export const routeTemplateMatrix = (
  routes: RouteTemplateList = routeTemplates,
): RouteDispatchMatrix => {
  const list = routes.map((route) => resolveRouteDispatch(route));
  const index = list.reduce<RouteDispatchMatrix['index']>((acc, dispatch) => {
    const key = `${dispatch.parsed.entity}:${dispatch.parsed.action}`;
    return {
      ...acc,
      [key]: dispatch,
    };
  }, {} as RouteDispatchMatrix['index']);
  return {
    list,
    index,
  };
};
