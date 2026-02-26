export interface TemplateBlueprint {
  readonly domain: string;
  readonly verb: string;
  readonly severity: string;
  readonly identifier: string;
  readonly metrics: readonly string[];
}

export type TemplateEnvelope<K extends string, T> = {
  readonly key: K;
  readonly value: T;
  readonly metadata: {
    readonly generatedAt: `${number}-${number}-${number}`;
    readonly checksum: number;
  };
};

export type RouteTokenMap<T extends Record<string, Record<string, TemplateBlueprint>>> = {
  [Domain in keyof T & string]: {
    [Verb in keyof T[Domain] & string]: {
      readonly route: `/${Domain}/${Verb}`;
      readonly verbCaps: Capitalize<Verb>;
      readonly config: T[Domain][Verb];
    };
  };
};

export type ExpandRouteMap<T extends Record<string, Record<string, TemplateBlueprint>>> = {
  [Domain in keyof T & string]: {
    [Verb in keyof T[Domain] & string as `mapped.${Domain}:${Verb}`]: {
      readonly id: `${Domain}:${Verb}`;
      readonly namespace: Verb;
      readonly payload: {
        readonly route: `/${Domain}/${Verb}`;
        readonly verbCaps: Capitalize<Verb>;
        readonly config: T[Domain][Verb];
      };
    };
  };
} & RouteTokenMap<T>;

export type RouteTemplate<T extends string> = T extends `${infer D}/${infer V}/${infer I}`
  ? {
      readonly domain: D;
      readonly verb: V;
      readonly identifier: I;
      readonly fingerprint: `${D}.${V}.${I}`;
    }
  : never;

export type RouteTemplateUnion<T extends readonly TemplateBlueprint[]> = T extends readonly [
  infer Blueprint extends TemplateBlueprint,
  ...infer Tail extends readonly TemplateBlueprint[],
]
  ? RouteTemplate<`/${Blueprint['domain']}/${Blueprint['verb']}/${Blueprint['identifier']}`> | RouteTemplateUnion<Tail>
  : never;

export type RecursiveTemplateTransform<
  T extends readonly TemplateBlueprint[],
  Suffix extends string = 'v1',
  Output = {}
> = T extends readonly [
  infer Blueprint extends TemplateBlueprint,
  ...infer Tail extends readonly TemplateBlueprint[],
]
  ? RecursiveTemplateTransform<
      Tail,
      Suffix,
      Output & {
        [K in `${Suffix}:${Lowercase<Blueprint['domain']>}:${Uppercase<Blueprint['verb']>}`]: RouteTemplate<
          `/${Blueprint['domain']}/${Blueprint['verb']}/${Blueprint['identifier']}`
        >;
      }
    >
  : Output;

export type TemplateRoutesFromObject<T extends Record<string, Record<string, TemplateBlueprint>>> = {
  [Domain in keyof T & string]: {
    [Verb in keyof T[Domain] & string]: RouteTemplate<`/${Domain}/${Verb}/${T[Domain][Verb]['identifier']}`>;
  }[keyof T[Domain] & string];
}[keyof T & string];

export type NestedRemapMap<T extends Record<string, Record<string, TemplateBlueprint>>> = {
  [Domain in keyof T & string as `${Domain}Domain`]: {
    [Verb in keyof T[Domain] & string as `${Verb}Verb`]: {
      readonly route: `/${Domain}/${Verb}`;
      readonly source: T[Domain][Verb];
      readonly alias: `alias.${Domain}.${Verb}.${T[Domain][Verb]['identifier']}`;
      readonly severity: T[Domain][Verb]['severity'];
      readonly envelopes: {
        [Metric in T[Domain][Verb]['metrics'][number] as `${Metric}Metric`]: {
          readonly name: Metric;
          readonly active: boolean;
        };
      };
    };
  };
};

export const rawRouteTemplateSource = {
  incident: {
    discover: {
      domain: 'incident',
      verb: 'discover',
      severity: 'low',
      identifier: 'id-a',
      metrics: ['latency', 'confidence'],
    },
    assess: {
      domain: 'incident',
      verb: 'assess',
      severity: 'high',
      identifier: 'id-b',
      metrics: ['precision', 'confidence'],
    },
    triage: {
      domain: 'incident',
      verb: 'triage',
      severity: 'critical',
      identifier: 'id-c',
      metrics: ['impact', 'timeToRecover'],
    },
  },
  workload: {
    discover: {
      domain: 'workload',
      verb: 'discover',
      severity: 'low',
      identifier: 'id-d',
      metrics: ['duration', 'throughput'],
    },
    mitigate: {
      domain: 'workload',
      verb: 'mitigate',
      severity: 'high',
      identifier: 'id-e',
      metrics: ['backlog', 'queue'],
    },
  },
  fabric: {
    restore: {
      domain: 'fabric',
      verb: 'restore',
      severity: 'critical',
      identifier: 'id-f',
      metrics: ['nodeCount', 'quorum'],
    },
    audit: {
      domain: 'fabric',
      verb: 'audit',
      severity: 'medium',
      identifier: 'id-g',
      metrics: ['ruleHits', 'exceptions'],
    },
  },
  policy: {
    notify: {
      domain: 'policy',
      verb: 'notify',
      severity: 'medium',
      identifier: 'id-h',
      metrics: ['channels', 'ackRate'],
    },
    observe: {
      domain: 'policy',
      verb: 'observe',
      severity: 'low',
      identifier: 'id-i',
      metrics: ['readiness', 'drift'],
    },
  },
} as const;

type RouteMapInput<T extends Record<string, Record<string, TemplateBlueprint>>> = T;

type ExpandedDomainValues<T extends RouteMapInput<any>> = {
  [D in keyof T & string]: {
    [V in keyof T[D] & string]: TemplateBlueprint & { domain: D; verb: V };
  }[keyof T[D] & string];
}[keyof T & string];

export type FabricTemplateMap = typeof rawRouteTemplateSource;
export type FabricTemplateKeys = RouteTokenMap<FabricTemplateMap>;
export type FabricMapped = ExpandRouteMap<FabricTemplateMap>;
export type FabricRecursiveMap = RecursiveTemplateTransform<ExpandedDomainValues<FabricTemplateMap>[]>;
export type FabricRouteUnion = RouteTemplateUnion<[
  ...Extract<ExpandedDomainValues<FabricTemplateMap>[], readonly TemplateBlueprint[]>
]>;

export const mapToTemplateRecord = <T extends Record<string, Record<string, TemplateBlueprint>>>(
  input: T,
): RouteTokenMap<T> => {
  const entries: Array<[string, { route: string; verbCaps: string; config: TemplateBlueprint }]> = [];
  for (const [domain, verbs] of Object.entries(input) as Array<[string, Record<string, TemplateBlueprint>]>) {
    for (const [verb, cfg] of Object.entries(verbs)) {
      entries.push([`${domain}:${verb}`, { route: `/${domain}/${verb}`, verbCaps: verb.toUpperCase(), config: cfg }]);
    }
  }
  return Object.fromEntries(entries) as unknown as RouteTokenMap<T>;
};

export const expandTemplateRemap = <T extends Record<string, Record<string, TemplateBlueprint>>>(input: T): ExpandRouteMap<T> => {
  const nested = mapToTemplateRecord(input);
  const projected = {} as Partial<Record<string, { readonly id: string; readonly namespace: string; readonly payload: unknown }>>;

  for (const [domain, verbs] of Object.entries(input) as Array<[string, Record<string, TemplateBlueprint>]>) {
    for (const [verb, cfg] of Object.entries(verbs)) {
      projected[`mapped.${domain}:${verb}`] = {
        id: `${domain}:${verb}`,
        namespace: verb,
        payload: { route: `/${domain}/${verb}`, verbCaps: verb.toUpperCase() as Capitalize<string>, config: cfg },
      };
    }
  }

  return { ...(nested as unknown as ExpandRouteMap<T>), ...(projected as unknown as ExpandRouteMap<T>) } as ExpandRouteMap<T>;
};

export const mapTemplateWithTemplateLiteral = (input: FabricTemplateMap): string[] => {
  const rows: string[] = [];
  for (const [domain, verbs] of Object.entries(input) as Array<[string, Record<string, TemplateBlueprint>]>) {
    for (const [verb, value] of Object.entries(verbs)) {
      rows.push(`/recovery/${domain}/${verb}/${value.identifier}`);
    }
  }
  return rows;
};

export const nestedRemap = <T extends Record<string, Record<string, TemplateBlueprint>>>(input: T): NestedRemapMap<T> => {
  const output = {} as NestedRemapMap<T>;
  for (const [domain, verbs] of Object.entries(input) as Array<[string, Record<string, TemplateBlueprint>]>) {
    const container = {} as Record<string, unknown>;
    for (const [verb, value] of Object.entries(verbs)) {
      container[`${verb}Verb`] = {
        route: `/${domain}/${verb}` as const,
        source: value,
        alias: `alias.${domain}.${verb}.${value.identifier}` as const,
        severity: value.severity,
        envelopes: value.metrics.reduce<Record<string, { name: string; active: boolean }>>((acc, metric) => {
          acc[`${metric}Metric`] = { name: metric, active: true };
          return acc;
        }, {}),
      };
    }
    output[`${domain}Domain` as keyof NestedRemapMap<T>] = container as NestedRemapMap<T>[keyof NestedRemapMap<T>];
  }
  return output;
};
