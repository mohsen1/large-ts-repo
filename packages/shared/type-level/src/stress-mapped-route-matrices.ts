export type RouteSurface = {
  command: {
    route: string;
    method: 'get' | 'post' | 'delete';
    weight: number;
  };
  signal: {
    channel: 'ws' | 'http' | 'grpc';
    qos: 'low' | 'high' | 'critical';
    replay: boolean;
  };
  policy: {
    owner: string;
    enforce: boolean;
    risk: 'low' | 'critical';
  };
};

export type UpperRemap<T extends Record<string, unknown>, S extends string> = {
  [K in keyof T as `${S}::${string & K}`]: T[K] extends Record<string, unknown>
    ? {
        [P in keyof T[K] as `${string & P}_${S}`]: T[K][P] extends string
          ? `${S}-${T[K][P]}`
          : T[K][P] extends number
            ? number
            : T[K][P] extends boolean
              ? 0 | 1
              : never;
      }
    : T[K];
};

export type SurfaceNamespace<T extends Record<string, RouteSurface>, Prefix extends string> = {
  [Domain in keyof T & string as `${Prefix}.${Domain}`]: {
    [DomainField in keyof T[Domain] & string as `${Domain}-${DomainField}`]: T[Domain][DomainField] extends string
      ? `${Prefix}_${DomainField}`
      : T[Domain][DomainField] extends number
        ? {
            readonly value: T[Domain][DomainField];
            readonly key: `${Domain}:${DomainField}`;
          }
        : T[Domain][DomainField] extends boolean
          ? {
              readonly flag: `${Prefix}-${DomainField}`;
              readonly active: T[Domain][DomainField];
            }
          : never;
  };
};

export type DeepReadOnly<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: T[K] extends Record<string, unknown>
    ? DeepReadOnly<T[K]>
    : T[K];
};

export type DeepRequiredState<T extends Record<string, unknown>> = {
  [K in keyof T]-?: T[K] extends Record<string, unknown> ? DeepRequiredState<T[K]> : T[K];
};

export type DeepPartialState<T extends Record<string, unknown>> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartialState<T[K]> : T[K];
};

export type MappedProjection<T extends Record<string, Record<string, unknown>>> = {
  [Root in keyof T as `root:${string & Root}`]: {
    [Path in keyof T[Root] as `${string & Root}::${string & Path}`]: {
      readonly raw: T[Root][Path];
      readonly label: `${string & Root}-${string & Path}`;
    };
  };
};

export const routeSurfaceModel = {
  command: {
    route: 'mesh/dispatch/signal',
    method: 'post',
    weight: 5,
  },
  signal: {
    channel: 'http',
    qos: 'high',
    replay: true,
  },
  policy: {
    owner: 'control-plane',
    enforce: true,
    risk: 'low',
  },
} as const;

export type RouteTemplateMap = UpperRemap<typeof routeSurfaceModel, 'tpl'>;
export type NamespaceSurface = SurfaceNamespace<{ core: typeof routeSurfaceModel }, 'core'>;
export type ReadonlySurface = DeepReadOnly<RouteSurface>;
export type RequiredSurface = DeepRequiredState<Partial<RouteSurface>>;
export type PartialSurface = DeepPartialState<RouteSurface>;
export type ProjectionSurface = MappedProjection<{ alpha: typeof routeSurfaceModel; beta: typeof routeSurfaceModel }>;

export const routeSurfaceCatalog = {
  command: [
    { key: 'command', value: routeSurfaceModel.command.route },
    { key: 'signal', value: routeSurfaceModel.signal.channel },
    { key: 'policy', value: routeSurfaceModel.policy.owner },
  ],
  matrix: Object.fromEntries(
    Object.entries(routeSurfaceModel).map(([section, value]) => [
      section,
      Object.keys(value).map((field) => `${section}:${field}`),
    ]),
  ),
} as const;

export type SurfaceRouteProjection = {
  readonly commandRoute: RouteTemplateMap['tpl::command'];
  readonly signalChannels: DeepReadOnly<RouteSurface['signal']>;
  readonly policyEnvelope: Readonly<{ readonly policyOwner: string; readonly enforce: 0 | 1 }>;
};

export const projectSurface = (value: typeof routeSurfaceModel): SurfaceRouteProjection => {
  return {
    commandRoute: {
      route_tpl: `tpl-${value.command.route}`,
      method_tpl: `tpl-post`,
      weight_tpl: value.command.weight,
    },
    signalChannels: value.signal,
    policyEnvelope: {
      policyOwner: `owner:${value.policy.owner}`,
      enforce: value.policy.enforce ? 1 : 0,
    },
  };
};

export type RouteRouteMatrix<T extends readonly string[]> = {
  [Index in keyof T as T[Index] & string]: {
    readonly label: `route-${T[Index] & string}`;
    readonly path: `${T[Index] & string}/diagnostics`;
  };
};

export const routeTemplateMatrix = <T extends readonly string[]>(routes: T): RouteRouteMatrix<T> => {
  return routes.reduce((acc, route) => {
    return {
      ...acc,
      [route]: {
        label: `route-${route}`,
        path: `${route}/diagnostics`,
      },
    };
  }, {} as RouteRouteMatrix<T>);
};

export const composeMappedProjection = () => {
  const runtimeSurface = routeSurfaceCatalog.matrix;
  const routeProfile = projectSurface(routeSurfaceModel);
  return {
    keys: Object.keys(runtimeSurface),
    labels: Object.entries(runtimeSurface).map(([key, parts]) => `${key}#${parts.length}`),
    routeProjection: routeProfile.commandRoute,
    signalChannelCount: routeProfile.signalChannels.channel.length,
  };
};
