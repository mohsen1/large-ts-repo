export type PrimitiveLeaf = string | number | boolean | bigint | symbol | null | undefined;

export type TemplateSignal<K extends string> =
  K extends `${infer Prefix}_${infer Suffix}`
    ? `${Capitalize<Prefix>}/${Capitalize<Suffix>}/v${Suffix extends `${infer _}${infer __}` ? 1 : 1}`
    : `Field/${Capitalize<K>}`;

export type PreserveTemplateKeys<T extends object> = {
  readonly [K in keyof T as K & string]: T[K] extends PrimitiveLeaf
    ? T[K]
    : T[K] extends readonly [unknown, ...unknown[]]
      ? Readonly<T[K]>
      : Readonly<T[K]>;
};

export type TemplateMapped<T extends Record<string, unknown>> = {
  -readonly [K in keyof T as K extends string ? `sig_${TemplateSignal<K>}` : never]: T[K] extends Record<string, unknown>
    ? TemplateMapped<T[K] & Record<string, unknown>>
    : T[K];
};

export type TemplateMappedPreserve<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `${Uppercase<K>}_KEY` : never]: T[K] extends Array<infer U>
    ? readonly [`${U & string}`, ...U[]]
    : T[K] extends Record<string, unknown>
      ? TemplateMappedPreserve<T[K] & Record<string, unknown>>
      : T[K] | null;
};

export type ExpandTemplate<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `${K}Map` : never]: {
    readonly [S in keyof T[K] & string as TemplateSignal<S>]: T[K][S] extends Record<string, unknown>
      ? ExpandTemplate<T[K] & Record<string, unknown>>
      : T[K][S];
  };
} & {
  readonly raw: T;
};

export type TransformPair<Key extends string, Value> = {
  [K in Key as `pair/${K}`]: Value;
} & {
  [K in Key as `pair/${K}/readonly`]: Value extends object ? Readonly<Value> : Value;
};

export type CrossTemplate<T extends Record<string, object>> = {
  readonly [Domain in keyof T & string]: {
    readonly [Action in keyof T[Domain] & string as `/${Domain}/${Action}`]: TransformPair<Action, T[Domain][Action]>;
  };
};

export const domainMatrix = {
  workload: {
    discover: { source: 'scheduler', weight: 1 },
    reconcile: { source: 'orchestrator', weight: 2 },
    recover: { source: 'playbook', weight: 3 },
  },
  policy: {
    synthesize: { source: 'planner', weight: 1 },
    validate: { source: 'control', weight: 3 },
    dispatch: { source: 'gateway', weight: 2 },
  },
  incident: {
    drill: { source: 'lab', weight: 2 },
    observe: { source: 'collector', weight: 5 },
  },
} as const satisfies Record<string, Record<string, { source: string; weight: number }>>;

export type MappedDomainMatrix = CrossTemplate<typeof domainMatrix>;
export type MappedDomainMatrixWritable = TemplateMapped<typeof domainMatrix>;
export type MappedDomainMatrixPreserved = TemplateMappedPreserve<typeof domainMatrix>;
export type MappedDomainExpanded = ExpandTemplate<typeof domainMatrix>;

export type MappedIntersection =
  MappedDomainMatrix &
  MappedDomainMatrixWritable &
  MappedDomainMatrixPreserved &
  PreserveTemplateKeys<typeof domainMatrix>;

export type MappedProjection<T> = T extends { readonly workload: infer W }
  ? W
  : never;

export type MappedUnion = MappedProjection<MappedIntersection>;

export const mappedDomainProjection = {
  raw: domainMatrix,
  workloadMap: {
    'Field/DiscoverMap': {
      discover: { key: 'discover', value: domainMatrix.workload.discover.source },
    },
    'Field/Discover/ReadonlyMap': { key: 'discover', value: domainMatrix.workload.discover.source } as any,
    'Field/ReconcileMap': { key: 'reconcile', value: domainMatrix.workload.reconcile },
    'Field/Reconcile/ReadonlyMap': { key: 'reconcile', value: domainMatrix.workload.reconcile } as any,
  },
  policyMap: {
    'Field/SynthesizeMap': { key: 'synthesize', value: domainMatrix.policy.synthesize },
    'Field/Synthesize/ReadonlyMap': { key: 'synthesize', value: domainMatrix.policy.synthesize } as any,
    'Field/ValidateMap': { key: 'validate', value: domainMatrix.policy.validate },
    'Field/Validate/ReadonlyMap': { key: 'validate', value: domainMatrix.policy.validate } as any,
    'Field/DispatchMap': { key: 'dispatch', value: domainMatrix.policy.dispatch },
    'Field/Dispatch/ReadonlyMap': { key: 'dispatch', value: domainMatrix.policy.dispatch } as any,
  },
  incidentMap: {
    'Field/DrillMap': { key: 'drill', value: domainMatrix.incident.drill },
    'Field/Drill/ReadonlyMap': { key: 'drill', value: domainMatrix.incident.drill } as any,
    'Field/ObserveMap': { key: 'observe', value: domainMatrix.incident.observe },
    'Field/Observe/ReadonlyMap': { key: 'observe', value: domainMatrix.incident.observe } as any,
  },
} as unknown as MappedDomainExpanded;

export const transformTemplate = <T extends Record<string, unknown>>(value: T): TemplateMapped<T> =>
  value as TemplateMapped<T>;

export const templateToRecord = <T extends Record<string, Record<string, unknown>>>(value: T): CrossTemplate<T> => {
  const output: Record<string, Record<string, unknown>> = {};
  for (const domain of Object.keys(value) as Array<keyof T>) {
    const payload = value[domain] as Record<string, unknown>;
    const mappedEntries: Record<string, unknown> = {};
    for (const action of Object.keys(payload) as string[]) {
      mappedEntries[`/${String(domain)}/${action}`] = {
        [`pair/${action}`]: { key: action, value: payload[action] },
        [`pair/${action}/readonly`]: payload[action] as object,
      };
    }
    output[domain as string] = mappedEntries as Record<string, unknown>;
  }
  return output as unknown as CrossTemplate<T>;
};
