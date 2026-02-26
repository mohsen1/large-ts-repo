export type StressOracleDomain =
  | 'incident'
  | 'inventory'
  | 'playbook'
  | 'telemetry'
  | 'policy';

export type StressOracleEntity = 'cluster' | 'node' | 'run' | 'command' | 'workflow' | 'metric' | 'policy';
export type StressOracleVerb = 'init' | 'dispatch' | 'observe' | 'resolve' | 'notify' | 'archive' | 'drill';
export type StressOracleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'debug' | 'trace';
export type NoiseToken = 4 | 5 | 6 | 7 | 8 | 9;

export type StressOracleSeed = `${StressOracleDomain}:${StressOracleEntity}:${StressOracleVerb}:${StressOracleSeverity}:${string}`;

export interface OracleSeedProfile {
  readonly scope: StressOracleDomain;
  readonly entity: StressOracleEntity;
  readonly verb: StressOracleVerb;
  readonly severity: StressOracleSeverity;
  readonly id: string;
  readonly noise: NoiseToken;
}

export type ResolveOracleSeed<T extends StressOracleSeed> =
  T extends `${infer D}:${infer E}:${infer V}:${infer S}:${infer Id}`
    ? D extends StressOracleDomain
      ? E extends StressOracleEntity
        ? V extends StressOracleVerb
          ? S extends StressOracleSeverity
            ? {
                readonly scope: D;
                readonly entity: E;
                readonly verb: V;
                readonly severity: S;
                readonly id: Id;
                readonly noise: 4;
              }
            : never
          : never
        : never
      : never
    : never;

export type ParseSeedUnion<T extends StressOracleSeed> = T extends StressOracleSeed ? ResolveOracleSeed<T> : never;

export interface OracleResolution<T extends readonly StressOracleSeed[]> {
  readonly entries: { [K in keyof T]: T[K] extends StressOracleSeed ? ResolveOracleSeed<T[K]> : never };
  readonly length: T['length'];
  readonly ready: true;
}

export interface OracleDispatch<A extends StressOracleSeed, B extends StressOracleSeed> {
  readonly input: A;
  readonly output: B;
  readonly active: boolean;
}

export interface OracleRouteGrid<T extends readonly StressOracleSeed[]> {
  readonly catalog: OracleResolution<T>;
  readonly entries: readonly ParseSeedUnion<T[number]>[];
  readonly dispatches: readonly OracleDispatch<T[number], T[number]>[];
}

export const seedCatalog = [
  'incident:cluster:init:critical:root' as const,
  'incident:workflow:dispatch:high:plan-001' as const,
  'telemetry:metric:observe:low:sensor' as const,
  'policy:policy:notify:info:compliance' as const,
] as const as readonly StressOracleSeed[];

export type SeedCatalog = typeof seedCatalog;

export const buildOracleRouteGrid = <T extends readonly StressOracleSeed[]>(seeds: T): OracleRouteGrid<T> => {
  const rows = seeds.map((seed) => {
    const [scope, entity, verb, severity, id] = seed.split(':');

    return {
      scope: scope as StressOracleDomain,
      entity: entity as StressOracleEntity,
      verb: verb as StressOracleVerb,
      severity: severity as StressOracleSeverity,
      id,
      noise: 4,
    } as OracleSeedProfile;
  });

  return {
    catalog: {
      entries: rows as OracleResolution<T>['entries'],
      length: seeds.length,
      ready: true,
    },
    entries: rows as ParseSeedUnion<T[number]>[],
    dispatches: rows.map(() => ({ input: seeds[0], output: seeds[0], active: true })),
  };
};

export const normalizedOracleCatalog: OracleRouteGrid<SeedCatalog> = buildOracleRouteGrid(seedCatalog);
