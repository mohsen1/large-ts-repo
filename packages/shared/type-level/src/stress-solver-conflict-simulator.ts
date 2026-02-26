export type ConflictPhase = 'init' | 'collect' | 'resolve' | 'finalize';
export type ConflictZone = 'network' | 'storage' | 'execution' | 'policy';
export type ConflictAction = 'block' | 'retry' | 'skip' | 'escalate' | 'heal';

export interface ConflictEvent<Zone extends ConflictZone, Action extends ConflictAction, Sequence extends number = number> {
  readonly zone: Zone;
  readonly action: Action;
  readonly sequence: Sequence;
  readonly tags: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
}

export type ConflictPayload<T extends ConflictPhase> = T extends 'init'
  ? { readonly prepared: true; readonly reason: string }
  : T extends 'collect'
    ? { readonly collected: number; readonly source: string }
    : T extends 'resolve'
      ? { readonly candidates: readonly string[]; readonly winner: string }
      : { readonly completed: boolean; readonly durationMs: number };

export type ConflictEnvelope<TPhase extends ConflictPhase, TZone extends ConflictZone, TAction extends ConflictAction> = {
  readonly phase: TPhase;
  readonly zone: TZone;
  readonly action: TAction;
  readonly details: ConflictPayload<TPhase>;
};

export type ConflictUnion = [
  ConflictEnvelope<'init', 'network', 'block'>,
  ConflictEnvelope<'collect', 'storage', 'retry'>,
  ConflictEnvelope<'resolve', 'execution', 'escalate'>,
  ConflictEnvelope<'finalize', 'policy', 'heal'>,
];

export type ConflictByZone<T extends ConflictZone> = Extract<ConflictUnion[number], { readonly zone: T }>;

export type ConflictLookup = {
  [K in ConflictUnion[number] as K['zone']]: Extract<ConflictUnion[number], { zone: K['zone'] }>;
};

export type PrefixPath<T extends string> = T extends `${infer Head}.${infer Tail}`
  ? Head extends string
    ? [Head, ...PrefixPath<Tail>]
    : never
  : [T];

export type PathValue<T, P extends string> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? PathValue<T[Head], Tail>
    : unknown
  : P extends keyof T
    ? T[P]
    : unknown;

export type DeepPropertyMap<T extends Record<string, unknown>> = {
  [K in keyof T as K & string]: T[K] extends Record<string, unknown>
    ? DeepPropertyMap<T[K]>
    : T[K];
};

export type DeepState = {
  readonly runtime: {
    readonly planner: {
      readonly active: boolean;
      readonly strategy: {
        readonly backoffMs: number;
        readonly maxRetries: number;
      };
    };
    readonly queue: {
      readonly pending: number;
      readonly inflight: number;
    };
  };
  readonly mesh: {
    readonly routes: {
      readonly total: number;
      readonly healthy: boolean;
    };
    readonly signals: {
      readonly pending: number;
      readonly urgent: number;
    };
  };
  readonly audit: {
    readonly ledger: {
      readonly entries: readonly string[];
      readonly lastSynced: string;
    };
  };
};

export type DeepGetPath<T extends Record<string, unknown>, P extends string> = PathValue<T, P>;

export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };

export type BrandedConflict<T> = Brand<T, 'conflict-environment'>;

export type ConflictCatalog = {
  readonly phases: readonly ConflictPhase[];
  readonly zones: readonly ConflictZone[];
  readonly actions: readonly ConflictAction[];
  readonly envelopes: ConflictUnion;
};

export const conflictCatalog: ConflictCatalog = {
  phases: ['init', 'collect', 'resolve', 'finalize'],
  zones: ['network', 'storage', 'execution', 'policy'],
  actions: ['block', 'retry', 'skip', 'escalate', 'heal'],
  envelopes: [
    {
      phase: 'init',
      zone: 'network',
      action: 'block',
      details: {
        prepared: true,
        reason: 'initial-connection-check',
      },
    },
    {
      phase: 'collect',
      zone: 'storage',
      action: 'retry',
      details: {
        collected: 12,
        source: 'telemetry',
      },
    },
    {
      phase: 'resolve',
      zone: 'execution',
      action: 'escalate',
      details: {
        candidates: ['route', 'signal', 'policy'],
        winner: 'signal',
      },
    },
    {
      phase: 'finalize',
      zone: 'policy',
      action: 'heal',
      details: {
        completed: true,
        durationMs: 42,
      },
    },
  ] as const,
};

export const conflictDeepState: DeepPropertyMap<DeepState> = {
  runtime: {
    planner: {
      active: true,
      strategy: {
        backoffMs: 100,
        maxRetries: 3,
      },
    },
    queue: {
      pending: 4,
      inflight: 1,
    },
  },
  mesh: {
    routes: {
      total: 20,
      healthy: true,
    },
    signals: {
      pending: 3,
      urgent: 0,
    },
  },
  audit: {
    ledger: {
      entries: ['boot', 'update', 'heal'],
      lastSynced: '2026-02-26T00:00:00.000Z',
    },
  },
};

export type ConflictByPath = {
  pendingQueue: DeepGetPath<DeepState, 'runtime.queue.pending'>;
  retryLimit: DeepGetPath<DeepState, 'runtime.planner.strategy.maxRetries'>;
  health: DeepGetPath<DeepState, 'mesh.signals.urgent'>;
};

export const mapToLookup = <T extends ConflictUnion>(items: T): Record<string, T[number]> => {
  return items.reduce(
    (memo, item, index) => {
      memo[`${item.zone}-${item.action}-${index}`] = item as T[number];
      return memo;
    },
    {} as Record<string, T[number]>,
  );
};

export const conflictByZone: ConflictLookup = {
  network: {
    phase: 'init',
    zone: 'network',
    action: 'block',
    details: conflictCatalog.envelopes[0]!.details,
  },
  storage: {
    phase: 'collect',
    zone: 'storage',
    action: 'retry',
    details: conflictCatalog.envelopes[1]!.details,
  },
  execution: {
    phase: 'resolve',
    zone: 'execution',
    action: 'escalate',
    details: conflictCatalog.envelopes[2]!.details,
  },
  policy: {
    phase: 'finalize',
    zone: 'policy',
    action: 'heal',
    details: conflictCatalog.envelopes[3]!.details,
  },
} as const;

export type PreparedConflict<T extends BrandedConflict<ConflictUnion>> = {
  readonly brand: T['__brand'];
  readonly first: T[0];
  readonly last: T[ConflictUnion['length'] extends 0 ? 0 : 3];
};

export const resolveConflicts = (state: DeepState, catalog: ConflictCatalog): BrandedConflict<ConflictUnion> => {
  const byZone = mapToLookup(catalog.envelopes);
  const ordered = Object.values(byZone).toSorted((left, right) => left.phase.localeCompare(right.phase));
  return ordered as BrandedConflict<ConflictUnion>;
};
