export interface BlueprintRecord {
  readonly key: string;
  readonly route: string;
  readonly active: boolean;
}

export interface BlueprintPayload {
  readonly id: string;
  readonly payload: Record<string, unknown>;
  readonly priority: 0 | 1 | 2 | 3;
}

export interface BlueprintRuntime {
  readonly owner: string;
  readonly namespace: string;
  readonly windowSec: number;
}

export type NormalizeK<K extends string> = K extends `${infer Head}_${infer Tail}`
  ? `${Uppercase<Head>}${NormalizeK<Tail>}`
  : Uppercase<K>;

export type WithRoutePath<T extends string> = `/api/${Lowercase<T>}`;

export type TemplateRemapKey<T extends string> = `route:${Lowercase<T>}`;

export type TemplateExpression<K extends string> = K extends `${infer Left}-${infer Right}`
  ? `${NormalizeK<Left>}_${NormalizeK<Right>}`
  : `CELL_${NormalizeK<K>}`;

export type PreserveReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

export type TransformField<T> = T extends BlueprintRecord
  ? {
      readonly recordKey: TemplateExpression<T['key']>;
      readonly routePath: WithRoutePath<T['route']>;
      readonly isActive: T['active'];
    }
  : T extends BlueprintPayload
    ? {
        readonly payloadHash: `${T['id']}:${T['priority']}`;
        readonly payloadKeys: keyof T['payload'] & string;
        readonly ownerWindow: `${T['id']}_${T['payload']['__'] & string}`;
      }
    : T extends BlueprintRuntime
      ? {
	        readonly owner: `${Uppercase<T['owner']>}`;
          readonly namespace: TemplateExpression<T['namespace']>;
          readonly windowWindow: T['windowSec'];
        }
      : never;

export type DeepTransform<T> = T extends ReadonlyArray<infer U>
  ? readonly DeepTransform<U>[]
  : T extends object
    ? {
        readonly [K in keyof T]: T[K] extends object
          ? K extends 'metadata'
            ? readonly [
                K extends string ? TemplateExpression<K> : never,
                ...DeepTransform<T[K]> extends readonly [infer Head, ...infer Rest]
                  ? [Head, ...Rest]
                  : [],
              ]
            : DeepTransform<T[K]>
          : T[K];
      }
    : T;

export type BlueprintRemap<T extends readonly unknown[]> =
  {
    [K in keyof T as K extends string
      ? K
      : `slot-${K & number}`]:
      K extends keyof T
        ? T[K] & { readonly source: K extends number ? TemplateExpression<`slot-${K & number}`> : never }
        : never;
  };

export type EventRow<T extends Record<string, BlueprintRecord | BlueprintPayload | BlueprintRuntime>> = {
  [K in keyof T & string as TemplateExpression<K>]: TransformField<T[K]>;
};

export type MapRows<T extends Record<string, Record<string, unknown>>> = {
  [K in keyof T & string as `grid-${K}`]: {
    [P in keyof T[K] & string as TemplateExpression<P>]: T[K][P];
  };
};

export interface RegistryEnvelope {
  readonly rows: Record<string, BlueprintRecord>;
  readonly runtime: BlueprintRuntime;
}

export interface AtlasBlueprint {
  readonly id: string;
  readonly records: readonly BlueprintRecord[];
  readonly payloads: readonly BlueprintPayload[];
  readonly runtime: BlueprintRuntime;
}

export type RegistrySurface<T extends RegistryEnvelope> = {
  readonly [K in keyof T['rows'] as TemplateExpression<K & string>]: Readonly<TransformField<T['rows'][K]>>;
} & {
  readonly runtime: TransformField<T['runtime']>;
};

export type RemappedBlueprint<T extends AtlasBlueprint> = {
  readonly [K in keyof T['records'] as K extends number ? TemplateRemapKey<`record-${K}`> : never]: T['records'][number] & {
    readonly bucket: string;
  };
} & {
  readonly payloads: {
    readonly [K in keyof T['payloads'] as K extends number
      ? TemplateRemapKey<`payload-${K}`>
      : never]: DeepTransform<T['payloads'][K]>;
  };
};

export const mapBlueprintEnvelope = <T extends AtlasBlueprint>(blueprint: T): RemappedBlueprint<T> => {
  const rows = Object.fromEntries(
    blueprint.records.map((entry, index) => [
      `route:record-${index}`,
      {
        ...entry,
        bucket: `route:${entry.key}`,
      },
    ]),
  );

  const payloads = Object.fromEntries(
    blueprint.payloads.map((payload, index) => [`payload-${index}`, { ...payload, payloadKeys: Object.keys(payload.payload) }]),
  );

  return {
    ...rows,
    payloads,
  } as RemappedBlueprint<T>;
};

export const buildTemplateLatticeMap = (entries: readonly BlueprintRecord[]) => {
  const mapped: Record<string, string> = Object.fromEntries(
    entries.map((entry) => [`route:entry-${entry.key}`, `${entry.route}:${entry.active}`]),
  );
  const inverse = Object.fromEntries(
    Object.entries(mapped).map(([k, v]) => [v, k]),
  ) as Record<string, string>;
  return { mapped, inverse };
};

export const blueprintIndexByNamespace = (records: readonly BlueprintRecord[]): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  const normalizeRuntimeTemplateKey = (value: string): string =>
    `route:${value.toUpperCase().replace(/[^A-Z0-9_]/gi, '_').replace(/_+/g, '_')}`;

  for (const record of records) {
    const key = `surface-${record.key}`.toLowerCase();
    const namespace = record.route.includes('/') ? record.route.split('/')[1] ?? 'default' : 'default';
    const arr = out[namespace] ?? [];
    arr.push(normalizeRuntimeTemplateKey(record.key));
    out[namespace] = arr;
  }

  return out;
};
