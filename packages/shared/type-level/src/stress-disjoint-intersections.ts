export interface MetaShard {
  readonly shard: 'meta';
  readonly id: string;
}

export interface RouteShard {
  readonly shard: 'route';
  readonly route: string;
}

export interface PolicyShard {
  readonly shard: 'policy';
  readonly policyVersion: number;
}

export interface SignalShard {
  readonly shard: 'signal';
  readonly signalCount: number;
}

export interface StrategyShard {
  readonly shard: 'strategy';
  readonly strategyId: string;
}

export interface SafetyShard {
  readonly shard: 'safety';
  readonly safetyBudget: bigint;
}

export type ShardUnion =
  | MetaShard
  | RouteShard
  | PolicyShard
  | SignalShard
  | StrategyShard
  | SafetyShard;

export type ShardTag = 'low' | 'medium' | 'high' | 'critical';

export interface OrbitBundle {
  readonly namespace: string;
  readonly shards: readonly [MetaShard, RouteShard, PolicyShard];
}

export interface SignalBundle {
  readonly namespace: string;
  readonly shards: readonly [MetaShard, SignalShard, StrategyShard];
}

export interface SafetyBundle {
  readonly namespace: string;
  readonly shards: readonly [MetaShard, PolicyShard, SafetyShard];
}

export type BundleProfile = OrbitBundle | SignalBundle | SafetyBundle;

export type BundleByKind<T extends BundleProfile> = T extends OrbitBundle
  ? {
      readonly bundleName: T['namespace'];
      readonly bundleVersion: 0 | 1 | 2 | 3 | 4 | 5;
      readonly namespace: T['namespace'];
      readonly shards: readonly [MetaShard, RouteShard, PolicyShard];
      readonly hasMeta: true;
      readonly hasRoute: true;
      readonly hasPolicy: true;
    }
  : T extends SignalBundle
    ? {
        readonly bundleName: T['namespace'];
        readonly bundleVersion: 0 | 1 | 2 | 3 | 4 | 5;
        readonly namespace: T['namespace'];
        readonly shards: readonly [MetaShard, SignalShard, StrategyShard];
        readonly hasMeta: true;
        readonly hasSignal: true;
        readonly hasStrategy: true;
      }
    : T extends SafetyBundle
      ? {
          readonly bundleName: T['namespace'];
          readonly bundleVersion: 0 | 1 | 2 | 3 | 4 | 5;
          readonly namespace: T['namespace'];
          readonly shards: readonly [MetaShard, PolicyShard, SafetyShard];
          readonly hasMeta: true;
          readonly hasPolicy: true;
          readonly hasSafety: true;
        }
      : never;

export type DistinctShardBundle<TName extends string, TVersion extends number> = {
  readonly bundleName: TName;
  readonly bundleVersion: TVersion;
  readonly namespace: string;
  readonly shards: readonly [MetaShard, ShardUnion, ShardUnion];
};

export const composeBundle = (namespace: string, priority: ShardTag): DistinctShardBundle<string, 1> => {
  return {
    bundleName: namespace,
    bundleVersion: 1,
    namespace,
    shards: [
      { shard: 'meta', id: `${namespace}-meta` },
      { shard: 'route', route: `/${namespace}` },
      { shard: 'policy', policyVersion: 1 },
    ],
  } as DistinctShardBundle<string, 1>;
};

export const signalBundle = (namespace: string): DistinctShardBundle<string, 3> => {
  return {
    bundleName: namespace,
    bundleVersion: 3,
    namespace,
    shards: [
      { shard: 'meta', id: `${namespace}-meta` },
      { shard: 'signal', signalCount: 5 },
      { shard: 'strategy', strategyId: `${namespace}-strategy` },
    ],
  } as DistinctShardBundle<string, 3>;
};

export const safetyBundle = (namespace: string): DistinctShardBundle<string, 4> => {
  return {
    bundleName: namespace,
    bundleVersion: 4,
    namespace,
    shards: [
      { shard: 'meta', id: `${namespace}-meta` },
      { shard: 'policy', policyVersion: 3 },
      { shard: 'safety', safetyBudget: 9n },
    ],
  } as DistinctShardBundle<string, 4>;
};

export const signalEnvelope: BundleByKind<SignalBundle> = {
  bundleName: 'signal',
  bundleVersion: 1,
  namespace: 'signal',
  hasMeta: true,
  hasSignal: true,
  hasStrategy: true,
  shards: [
    { shard: 'meta', id: 'signal-meta' },
    { shard: 'signal', signalCount: 12 },
    { shard: 'strategy', strategyId: 'signal-strategy' },
  ],
} as const;

export const policyEnvelope: BundleByKind<SafetyBundle> = {
  bundleName: 'policy',
  bundleVersion: 2,
  namespace: 'policy',
  hasMeta: true,
  hasPolicy: true,
  hasSafety: true,
  shards: [
    { shard: 'meta', id: 'policy-meta' },
    { shard: 'policy', policyVersion: 7 },
    { shard: 'safety', safetyBudget: 100n },
  ],
} as const;

export const resolveBundle = <T extends BundleProfile>(bundle: T): BundleByKind<T> => {
  if (bundle.shards[1].shard === 'signal' && bundle.shards[2].shard === 'strategy') {
    return {
      bundleName: bundle.namespace,
      bundleVersion: (bundle.namespace.length % 6) as 0 | 1 | 2 | 3 | 4 | 5,
      namespace: bundle.namespace,
      shards: bundle.shards,
      hasMeta: true,
      hasSignal: true,
      hasStrategy: true,
    } as BundleByKind<T>;
  }

  if (bundle.shards[1].shard === 'policy' && bundle.shards[2].shard === 'safety') {
    return {
      bundleName: bundle.namespace,
      bundleVersion: (bundle.namespace.length % 6) as 0 | 1 | 2 | 3 | 4 | 5,
      namespace: bundle.namespace,
      shards: bundle.shards,
      hasMeta: true,
      hasPolicy: true,
      hasSafety: true,
    } as BundleByKind<T>;
  }

  return {
    bundleName: bundle.namespace,
    bundleVersion: (bundle.namespace.length % 6) as 0 | 1 | 2 | 3 | 4 | 5,
    namespace: bundle.namespace,
    shards: bundle.shards,
    hasMeta: true,
    hasRoute: true,
    hasPolicy: true,
  } as BundleByKind<T>;
};
