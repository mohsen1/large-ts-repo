import type { Brand } from '@shared/type-level';
import {
  type ConstraintMesh,
  type IntersectedCatalog,
  type NestedTemplateMap,
  type PathKeys,
  type PathValue,
  type PreservedMapped,
  type TemplateMapped,
  type ResolveCommand,
  type StressCommand,
  type StressDomainUnion,
  type SolverDiscriminated,
} from '@shared/type-level';

type DeepGet<TValue, TPath extends string> = TPath extends `${infer Head}.${infer Rest}`
  ? Head extends keyof TValue
    ? Rest extends string
      ? DeepGet<TValue[Head], Rest>
      : TValue[Head]
    : unknown
  : TValue & unknown;

type NoInfer<T> = [T][T extends unknown ? 0 : never];

export interface SyntheticSchemaDescriptor {
  readonly schema: Brand<string, 'SchemaDescriptor'>;
  readonly version: `${number}.${number}.${number}`;
  readonly source: Brand<string, 'SchemaSource'>;
}

export interface SyntheticSchemaEnvelope {
  readonly id: Brand<string, 'SyntheticSchemaId'>;
  readonly owner: string;
  readonly command: StressCommand;
  readonly descriptor: SyntheticSchemaDescriptor;
  readonly constraints: readonly string[];
  readonly [key: string]: unknown;
}

export type SchemaByCommand<T extends readonly StressCommand[]> = {
  [Index in keyof T]: T[Index] extends StressCommand
    ? SolverDiscriminated<T[Index]> & { readonly position: Index }
    : never;
};

export type SchemaIntersection<TSchemas extends readonly Record<string, unknown>[]> = IntersectedCatalog<
  [
    {
      readonly phase: 'ingest';
      readonly required: true;
    },
    {
      readonly phase: 'plan';
      readonly required: true;
    },
    ...TSchemas,
  ]
>;

export interface SchemaContract<
  TDomain extends StressDomainUnion = StressDomainUnion,
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly domain: TDomain;
  readonly payload: TSchema;
  readonly keys: PathKeys<TSchema>;
}

export interface TemplateRecord extends PreservedMapped<{ readonly route: string; readonly command: string }> {}

export type SchemaPath<TSchema extends Record<string, object>> = {
  readonly keys: PathKeys<TSchema>;
  readonly value: DeepGet<TSchema, PathKeys<TSchema>>;
};

export type CommandRegistry<T extends readonly StressCommand[]> = SchemaByCommand<T> & {
  readonly routeMap: Readonly<Record<string, string>>;
};

type ConstraintMap<T extends ReadonlyArray<{ readonly domain: string; readonly signal: string; readonly checksum: string }>> = {
  [Index in keyof T as T[Index] extends { readonly domain: infer Domain }
    ? Domain extends string
      ? `mesh:${Domain}`
      : never
    : never]: T[Index];
};

const makeConstraint = <
  TDomain extends string,
  TSignal extends `signal:${TDomain}`,
  TRows extends readonly Record<TDomain, TSignal>[],
>(
  domain: TDomain,
  signal: TSignal,
  rows: TRows,
): ConstraintMesh<TDomain, TSignal, TRows> => ({
  domain,
  signal,
  records: rows,
  checksum: `${domain}-${signal}`,
});

export const buildConstraintMesh = () => {
  return {
    workload: makeConstraint('workload', 'signal:workload', [{ workload: 'signal:workload' }]),
    policy: makeConstraint('policy', 'signal:policy', [{ policy: 'signal:policy' }]),
    scheduler: makeConstraint('scheduler', 'signal:scheduler', [{ scheduler: 'signal:scheduler' }]),
    recovery: makeConstraint('recovery', 'signal:recovery', [{ recovery: 'signal:recovery' }]),
  };
};

const schemaA = {
  id: 'synthetic-schema-a' as Brand<string, 'SyntheticSchemaId'>,
  descriptor: {
    schema: 'schema-a' as Brand<string, 'SchemaDescriptor'>,
    version: '1.0.0',
    source: 'source-a' as Brand<string, 'SchemaSource'>,
  },
  command: 'discover:workload:low',
  owner: 'recovery-lab',
  constraints: ['ingest', 'reconcile'],
} satisfies SyntheticSchemaEnvelope;

const schemaB = {
  id: 'synthetic-schema-b' as Brand<string, 'SyntheticSchemaId'>,
  descriptor: {
    schema: 'schema-b' as Brand<string, 'SchemaDescriptor'>,
    version: '2.1.0',
    source: 'source-b' as Brand<string, 'SchemaSource'>,
  },
  command: 'synthesize:policy:high',
  owner: 'recovery-lab',
  constraints: ['snapshot', 'restore'],
} satisfies SyntheticSchemaEnvelope;

type MappedSchema = TemplateMapped<{ readonly schemaA: typeof schemaA; readonly schemaB: typeof schemaB }>;
const mappedSchema = ({} as MappedSchema);

const nestedSchema = {
  topology: {
    nodes: {
      main: { state: 'active' },
      replay: { state: 'queued' },
    },
    routes: {
      primary: '/dispatch/workload/recover',
    },
  },
} as const;

const nestedMapped: NestedTemplateMap<typeof nestedSchema> = {
  'top.topology': {
    'inner.nodes': nestedSchema.topology.nodes,
    'inner.routes': nestedSchema.topology.routes,
  },
};

export const schemaRecords = {
  primary: schemaA,
  secondary: schemaB,
  routeValues: mappedSchema,
  nested: nestedMapped,
} as const satisfies Readonly<Record<string, unknown>>;

type CatalogValue<T> = T[keyof T];
type ReadPath<T> = T extends { readonly topology: infer Topology }
  ? Topology extends object
    ? PathValue<T, 'topology.nodes'>
    : never
  : never;

const pathValue = (schemaRecords.nested as unknown) as ReadPath<typeof nestedSchema>;

const mapBySeverity = (schema: SyntheticSchemaEnvelope): string => schema.constraints.join(':');

export const toSchemaContract = (schema: SyntheticSchemaEnvelope): SchemaContract<StressDomainUnion, typeof schema> => ({
  domain: 'workload' as StressDomainUnion,
  payload: schema,
  keys: 'descriptor.version' as PathKeys<typeof schema>,
});

export const schemaEnvelopeRows = ([schemaA, schemaB] as const).map((entry) => ({
  key: entry.id,
  value: mapBySeverity(entry),
}));

const safeLookup = <TRecord extends Record<string, unknown>, TPath extends PathKeys<TRecord>>(
  source: TRecord & Record<string, unknown>,
  path: TPath,
): PathValue<TRecord, TPath> => {
  const parts = String(path).split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
      continue;
    }
    return undefined as PathValue<TRecord, TPath>;
  }
  return current as PathValue<TRecord, TPath>;
};

export const routeFromRecord = (record: SyntheticSchemaEnvelope): string => String(safeLookup(record, 'descriptor.version'));
export const schemaKeys = (record: SyntheticSchemaEnvelope): readonly string[] => {
  const keys = ['id', 'owner', 'descriptor.schema', 'descriptor.version', 'descriptor.source'];
  return keys.filter((entry) => safeLookup(record, entry as PathKeys<SyntheticSchemaEnvelope>) !== undefined);
};
