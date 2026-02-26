import type { DomainAction, DomainMetadata, DomainToken } from '@shared/type-level';

export type StressTypeLabMode = 'explore' | 'simulate' | 'validate' | 'audit' | 'stress' | 'graph';

export type StressTypeBrand = {
  readonly id: `lab-${string}`;
  readonly code: `code-${string}`;
};

export interface StressTypeLabSeed {
  readonly tenant: `tenant-${string}`;
  readonly domain: DomainToken;
  readonly mode: StressTypeLabMode;
  readonly timestamp: number;
}

export type ActionTuple = [DomainToken, DomainAction];

export type StressTypeLabRoute = ReadonlyArray<ActionTuple>;

export interface StressTypeCommandRow {
  readonly rowId: `row-${string}`;
  readonly route: StressTypeLabRoute;
  readonly active: boolean;
  readonly severity: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly metadata: DomainMetadata;
}

export interface StressTypeLabSnapshot {
  readonly seed: StressTypeLabSeed;
  readonly commands: readonly StressTypeCommandRow[];
  readonly lane: readonly StressTypeLabMode[];
  readonly resolved: ReturnType<typeof resolveFrom>
}

export type StressTypeModeState =
  | { readonly kind: 'idle'; readonly seed: StressTypeLabSeed }
  | { readonly kind: 'warming'; readonly step: number }
  | { readonly kind: 'running'; readonly step: number; readonly pressure: number }
  | { readonly kind: 'degraded'; readonly reason: string; readonly severity: number }
  | { readonly kind: 'stable'; readonly score: number };

export type StressTypeRouteInput = {
  readonly routes: readonly DomainAction[];
  readonly metadata: ReadonlyArray<DomainMetadata>;
};

export interface StressTypePlan<TMode extends StressTypeLabMode = StressTypeLabMode> {
  readonly tenant: `tenant-${string}`;
  readonly mode: TMode;
  readonly signals: readonly string[];
  readonly plan: StressTypeRouteInput;
  readonly state: StressTypeModeState;
}

export const defaultModeSequence: readonly StressTypeLabMode[] = [
  'explore',
  'simulate',
  'validate',
  'audit',
  'stress',
  'graph',
] as const;

export const resolveFrom = <T extends DomainToken>(
  domain: T,
  action: DomainAction,
): {
  readonly domain: T;
  readonly action: DomainAction;
  readonly metadata: DomainMetadata;
} => ({
  domain,
  action,
  metadata: {
    code: `${domain}:${action}` as DomainMetadata['code'],
    phase: 'bootstrap',
    tags: [domain],
    severity: 0 as DomainMetadata['severity'],
  },
});

export const defaultSnapshot = (tenant: string, mode: StressTypeLabMode): StressTypeLabSnapshot => {
  const seed = {
    tenant: `tenant-${tenant}` as StressTypeLabSeed['tenant'],
    domain: 'atlas' as DomainToken,
    mode,
    timestamp: Date.now(),
  };
  return {
    seed,
    commands: [],
    lane: defaultModeSequence,
    resolved: [] as unknown as ReturnType<typeof resolveFrom>,
  } as StressTypeLabSnapshot;
};

export const buildSeedRows = (seed: StressTypeLabSeed): StressTypeCommandRow[] => {
  const base = {
    domain: seed.domain,
    metadata: {
      code: `${seed.domain}:route` as DomainMetadata['code'],
      phase: 'bootstrap',
      tags: [seed.domain],
      severity: 0 as DomainMetadata['severity'],
    },
  } as const;
  return [
    {
      rowId: `row-${seed.tenant}-explore` as StressTypeCommandRow['rowId'],
      route: [
        [seed.domain, `${seed.domain}:route`],
        [seed.domain, `${seed.domain}:validate`],
      ],
      active: true,
      severity: 3,
      metadata: base.metadata,
    },
    {
      rowId: `row-${seed.tenant}-validate` as StressTypeCommandRow['rowId'],
      route: [
        [seed.domain, `${seed.domain}:dispatch`],
        [seed.domain, `${seed.domain}:observe`],
      ],
      active: true,
      severity: 4,
      metadata: base.metadata,
    },
    {
      rowId: `row-${seed.tenant}-stress` as StressTypeCommandRow['rowId'],
      route: [
        [seed.domain, `${seed.domain}:execute`],
        [seed.domain, `${seed.domain}:simulate`],
      ],
      active: false,
      severity: 7,
      metadata: base.metadata,
    },
  ];
};

export const commandBuckets = (commands: readonly StressTypeCommandRow[]) =>
  commands.reduce((acc, command) => {
    const severityBucket = command.severity >= 6 ? 'high' : command.severity >= 3 ? 'mid' : 'low';
    return {
      ...acc,
      [severityBucket]: [...acc[severityBucket], command.rowId],
    };
  }, { low: [] as string[], mid: [] as string[], high: [] as string[] } satisfies {
    low: string[];
    mid: string[];
    high: string[];
  });
