export type DotPath<T> = keyof T & string;

export interface RouteDescriptorBase {
  readonly verb: string;
  readonly route: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

export interface EndpointLabel {
  readonly label: string;
  readonly namespace: string;
}

export type TemplateValue<T> =
  T extends string ? `${Uppercase<T>}_SIG` : T extends number ? `${T & number}_NUM` : T extends boolean ? `${T extends true ? 'ENABLED' : 'DISABLED'}` : 'unknown';

export type Prefixer<K extends string, N extends string> = `${N}::${K}`;
export type Suffixer<K extends string, N extends string> = `${K}::${N}`;

export type RouteSegments<T extends string> = T extends `${infer Head}/${infer Tail}` ? [Head, ...RouteSegments<Tail>] : [T];

export type Unionize<T extends readonly string[]> = T[number];

export type SegmentMatrix<T extends readonly string[]> = {
  [K in Unionize<T> as `${K}::node`]: K;
};

export type NamespaceRemap<T extends Record<string, unknown>, Scope extends string> = {
  [K in keyof T as Prefixer<Extract<K, string>, Scope>]: T[K];
};

export type NamespaceSuffixRemap<T extends Record<string, unknown>, Scope extends string> = {
  [K in keyof T as Suffixer<Extract<K, string>, Scope>]: T[K];
};

export type NamespaceTransform<T extends Record<string, unknown>, Scope extends string> = {
  [K in keyof T as `${Scope}/${Extract<K, string>}`]: T[K] extends Record<string, unknown>
    ? NamespaceTransform<T[K], Scope>
    : T[K];
};

export type NamespaceScope<T extends Record<string, unknown>, Scope extends string> = NamespaceRemap<NamespaceSuffixRemap<T, Scope>, Scope>;

export type RouteRemap<T extends Record<string, unknown>, Scope extends string> = {
  [K in keyof T as `${Scope}::${Extract<K, string>}`]: T[K] extends Record<string, unknown>
    ? NamespaceScope<T[K], Scope>
    : TemplateValue<T[K]>;
};

export type RemapEndpointKeys<T extends Record<string, RouteDescriptorBase>> = {
  [K in keyof T as `${Extract<K, string>}.route`]: T[K]['route'];
} & {
  [K in keyof T as `${Extract<K, string>}.verb`]: T[K]['verb'];
};

export type NormalizeEndpoint<T extends Record<string, RouteDescriptorBase>> = {
  [K in keyof T as `${K & string}-id`]: {
    readonly id: K & string;
    readonly method: T[K]['method'];
  };
};

export type FlattenNested<T> = {
  [K in keyof T as K & string]: T[K] extends Record<string, unknown> ? FlattenNested<T[K]> : T[K];
};

type RecordedTemplate<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? { [P in keyof T[K] as `${K & string}/${P & string}`]: T[K][P] }
    : { [P in K & string]: T[K] };
}[keyof T];

export type TemplateMap<T extends Record<string, unknown>, Scope extends string = 'global'> = NamespaceScope<RecordedTemplate<T>, Scope>;

export type TemplateMatrix<T extends Record<string, unknown>, Scope extends string = 'global'> = {
  readonly map: TemplateMap<T, Scope>;
  readonly rootKeys: string;
};

export type RouteTemplateKeys<T> = T extends Record<string, unknown> ? { [K in keyof T]: K & string }[keyof T] : never;

export type TemplateProjection<T extends Record<string, unknown>> = {
  [K in RouteTemplateKeys<T> as `${Lowercase<K>}.template`]?: T[K] extends object
    ? string
    : T[K] extends string
      ? TemplateValue<T[K]>
      : T[K] extends number
        ? TemplateValue<T[K]>
        : T[K] extends boolean
          ? TemplateValue<T[K]>
          : `x-${K}`;
} & {
  [K in RouteTemplateKeys<T> as K & string]: T[K] extends Record<string, unknown>
    ? T[K] extends object
      ? T[K] extends Record<string, unknown>
        ? TemplateProjection<T[K]>
        : never
      : never
    : T[K] extends string
      ? TemplateValue<T[K]>
      : T[K] extends number
        ? TemplateValue<T[K]>
        : T[K] extends boolean
          ? TemplateValue<T[K]>
          : `x-${K}`;
};

export type RouteTemplateCatalog<T extends Record<string, unknown>, Scope extends string = 'global'> = {
  readonly catalog: TemplateMatrix<T, Scope>;
  readonly namespaces: {
    route: SegmentMatrix<['create', 'update', 'delete', 'query', 'rollback']>;
    envelope: SegmentMatrix<['start', 'stop', 'flush', 'watch', 'notify']>;
  };
};

export type KeyedRoute<T extends string> = `${T}::route`;

export type TemplateLookup<T extends Record<string, unknown>, K extends string> = K extends keyof T
  ? K
  : K extends `${infer Head}/${infer Tail}`
    ? Head | TemplateLookup<T, Tail>
    : never;

export type DeepPayload = {
  readonly id: string;
  readonly trace: readonly string[];
  readonly nested: {
    readonly label: string;
    readonly details: {
      readonly code: number;
      readonly valid: boolean;
    };
  };
};

export type RouteTemplateMap<T extends Record<string, unknown>, S extends string = 'global'> = TemplateMap<T, S>;

export const buildTemplatePayload = () => {
  const record: TemplateProjection<{
    route: RouteDescriptorBase;
    envelope: EndpointLabel;
    payload: DeepPayload;
  }> = {
    'route.route': '/recovery/stream',
    'route.verb': 'read',
    'route.method': 'GET',
    'route.template': 'x-route',
    'envelope.label': 'recovery',
    'envelope.namespace': 'core',
    'envelope.template': 'x-envelope',
    'payload.id': 'px-1',
    'payload.trace': [],
    'payload.nested': {
      label: 'core',
      details: { code: 200, valid: true },
    },
    'payload.template': 'x-payload',
  } as unknown as TemplateProjection<{
    route: RouteDescriptorBase;
    envelope: EndpointLabel;
    payload: DeepPayload;
  }>;

  return record;
};

export const buildNamespace = <T extends Record<string, unknown>, S extends string>(source: T, scope: S): NamespaceTransform<T, S> => {
  const out = {} as NamespaceTransform<T, S>;
  const walk = (value: Record<string, unknown>, destination: Record<string, unknown>) => {
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const key = `${scope}/${rawKey}`;
      if (rawValue !== null && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        destination[key] = walk(rawValue as Record<string, unknown>, {});
      } else {
        destination[key] = rawValue;
      }
    }
    return destination;
  };
  return walk(source, out as Record<string, unknown>) as NamespaceTransform<T, S>;
};

export const templateKeys = Object.keys(buildTemplatePayload()) as Array<keyof ReturnType<typeof buildTemplatePayload>>;

export const routeTemplateCatalog: RouteTemplateCatalog<{
  route: RouteDescriptorBase;
  envelope: EndpointLabel;
  payload: DeepPayload;
}, 'recovery'> = {
  catalog: {
    map: {} as TemplateMap<{
      route: RouteDescriptorBase;
      envelope: EndpointLabel;
      payload: DeepPayload;
    }, 'recovery'>,
    rootKeys: 'route',
  },
  namespaces: {
    route: {
      'create::node': 'create',
      'update::node': 'update',
      'delete::node': 'delete',
      'query::node': 'query',
      'rollback::node': 'rollback',
    },
    envelope: {
      'start::node': 'start',
      'stop::node': 'stop',
      'flush::node': 'flush',
      'watch::node': 'watch',
      'notify::node': 'notify',
    },
  },
};

export const buildRouteTemplateCatalog = (): RouteTemplateCatalog<{
  route: RouteDescriptorBase;
  envelope: EndpointLabel;
  payload: DeepPayload;
}, 'recovery'> => ({
  catalog: {
    map: buildNamespace(
      {
        route: {
          route: '/recovery/stream',
          verb: 'read',
          method: 'GET',
        },
        envelope: {
          namespace: 'core',
          label: 'recovery',
        },
        payload: {
          id: 'px-1',
          trace: ['seed'],
          nested: {
            label: 'core',
            details: { code: 200, valid: true },
          },
        },
      },
      'recovery',
    ) as unknown as TemplateMap<{
      route: RouteDescriptorBase;
      envelope: EndpointLabel;
      payload: DeepPayload;
    }, 'recovery'>,
    rootKeys: 'route',
  },
  namespaces: {
    route: {
      'create::node': 'create',
      'update::node': 'update',
      'delete::node': 'delete',
      'query::node': 'query',
      'rollback::node': 'rollback',
    },
    envelope: {
      'start::node': 'start',
      'stop::node': 'stop',
      'flush::node': 'flush',
      'watch::node': 'watch',
      'notify::node': 'notify',
    },
  },
});
