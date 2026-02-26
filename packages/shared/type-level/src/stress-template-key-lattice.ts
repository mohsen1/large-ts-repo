import type { Brand, DeepReadonly, OmitNever } from './patterns';

export type EntityKind =
  | 'asset'
  | 'agent'
  | 'catalog'
  | 'command'
  | 'control'
  | 'event'
  | 'fabric'
  | 'graph'
  | 'intent'
  | 'lane'
  | 'metric'
  | 'policy'
  | 'playbook'
  | 'portfolio'
  | 'quantum'
  | 'scenario'
  | 'signal';

export type EventToken<K extends EntityKind> = `${Uppercase<K>}_${number}`;
export type RouteToken<K extends EntityKind> = `${K}-route-${number}`;
export type FieldToken<K extends EntityKind, F extends string> = `${K}__${F}`;

export interface EventRecordShape {
  readonly id: Brand<string, 'record-id'>;
  readonly kind: EntityKind;
  readonly ts: number;
}

export interface EventDetailShape {
  readonly details: string;
  readonly path: `/${string}`;
}

export type EventEnvelope<T extends EntityKind, F extends string = string> =
  { readonly [K in `entity-${T}`]: Brand<string, T> } & {
    readonly [K in `event-${RouteToken<T>}`]: EventToken<T>;
  } & { readonly [K in `field-${FieldToken<T, F>}`]: F };

export type MappedKey<T> = T extends string
  ? T extends `entity-${infer K}`
    ? K extends EntityKind
      ? `runtime:${Uppercase<K>}`
      : never
    : `runtime:${T}`
  : never;

export type TemplateTransform<T, Prefix extends string> = {
  [K in keyof T as K extends string
    ? `${Prefix}${K & string}`
    : never]: T[K];
};

export type TemplateProject<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}${K}` : never]:
    T[K] extends Record<string, unknown> ? TemplateProject<T[K], Prefix> : DeepReadonly<T[K]>;
};

export type CanonicalizeTemplate<T> = {
  [K in keyof T as K extends string ? `canonical.${K}` : never]: T[K];
};

export type MergeTemplate<T, U, V = {}> = Omit<T, keyof U> & U & Omit<V, keyof (T & U)>;

type SeedTemplate<T extends EntityKind> = EventEnvelope<T> &
  { readonly [K in keyof OmitNever<{ [K2 in EventRecordShape['kind']]: string }>] : string } & {
    readonly [K in `${T}`]: {
      readonly fields: {
        readonly [K2 in `${K}-state`]: K2;
      };
    };
  };

export type RemapTemplates<T extends readonly EntityKind[]> = {
  [K in T[number]]: MappedKey<`entity-${K}`> extends infer R
    ? R extends string
      ? {
          readonly source: K;
          readonly key: R;
          readonly schema: TemplateTransform<TemplateProject<SeedTemplate<K>, 'k'>, 'r:'>;
          readonly canonical: CanonicalizeTemplate<TemplateProject<SeedTemplate<K>, 'k:'>>;
        }
      : never
    : never;
}[T[number]];

export type RouteSchema = {
  readonly [K in EntityKind]: {
    readonly route: RouteToken<K>;
    readonly eventToken: EventToken<K>;
    readonly fieldToken: FieldToken<K, keyof EventRecordShape & string>;
  };
};

export type RouteSignature = keyof RouteSchema;

export const routeSchema = {
  asset: { route: 'asset-route-1', eventToken: 'ASSET_1', fieldToken: 'asset__id' },
  agent: { route: 'agent-route-2', eventToken: 'AGENT_2', fieldToken: 'agent__id' },
  catalog: { route: 'catalog-route-3', eventToken: 'CATALOG_3', fieldToken: 'catalog__id' },
  command: { route: 'command-route-4', eventToken: 'COMMAND_4', fieldToken: 'command__id' },
  control: { route: 'control-route-5', eventToken: 'CONTROL_5', fieldToken: 'control__id' },
  event: { route: 'event-route-6', eventToken: 'EVENT_6', fieldToken: 'event__id' },
  fabric: { route: 'fabric-route-7', eventToken: 'FABRIC_7', fieldToken: 'fabric__id' },
  graph: { route: 'graph-route-8', eventToken: 'GRAPH_8', fieldToken: 'graph__id' },
  intent: { route: 'intent-route-9', eventToken: 'INTENT_9', fieldToken: 'intent__id' },
  lane: { route: 'lane-route-10', eventToken: 'LANE_10', fieldToken: 'lane__id' },
  metric: { route: 'metric-route-11', eventToken: 'METRIC_11', fieldToken: 'metric__id' },
  policy: { route: 'policy-route-12', eventToken: 'POLICY_12', fieldToken: 'policy__id' },
  playbook: { route: 'playbook-route-13', eventToken: 'PLAYBOOK_13', fieldToken: 'playbook__id' },
  portfolio: { route: 'portfolio-route-14', eventToken: 'PORTFOLIO_14', fieldToken: 'portfolio__id' },
  quantum: { route: 'quantum-route-15', eventToken: 'QUANTUM_15', fieldToken: 'quantum__id' },
  scenario: { route: 'scenario-route-16', eventToken: 'SCENARIO_16', fieldToken: 'scenario__id' },
  signal: { route: 'signal-route-17', eventToken: 'SIGNAL_17', fieldToken: 'signal__id' },
} as const satisfies RouteSchema;

export const activeKinds = Object.keys(routeSchema) as readonly EntityKind[];
export const selectedKeys = activeKinds.map((kind) => `entity-${kind}` as const);

export const resolveSchema = <T extends EntityKind>(kind: T): RouteSchema[T] => {
  return routeSchema[kind];
};

export const mapTemplateKinds = <T extends readonly EntityKind[]>(kinds: T): Array<RemapTemplates<T>> => {
  const output: Array<RemapTemplates<T>> = [];
  for (const kind of kinds) {
    output.push({
      source: kind,
      key: `canonical:${kind.toUpperCase()}`,
      schema: {
        [`r:entity-${kind}`]: `${kind}:entity` as string,
        [`r:event-${routeSchema[kind].eventToken}`]: routeSchema[kind].eventToken,
        [`r:field-${routeSchema[kind].fieldToken}`]: routeSchema[kind].fieldToken,
      },
      canonical: {
        'canonical.entity': `${kind}:entity`,
        'canonical.kind': kind,
      },
    } as RemapTemplates<T>[number]);
  }
  return output;
};

export const templateByKind = (kind: EntityKind): RemapTemplates<readonly [typeof kind]> => {
  return mapTemplateKinds([kind])[0];
};

export const normalizeSchemaToken = (kind: EntityKind, phase: 'read' | 'write' | 'archive'): string => {
  const schema = resolveSchema(kind);
  return `${schema.route}:${phase}:${schema.eventToken}`;
};
