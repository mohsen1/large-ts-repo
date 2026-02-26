import type { Brand } from './patterns';

export type PolicyShard<TTag extends string> = {
  readonly [K in `policy:${TTag}:enabled`]: boolean;
};

export type ConstraintShard<TTag extends string> = {
  readonly [K in `constraint:${TTag}:domain`]: TTag;
};

export type MetricShard<TTag extends string> = {
  readonly [K in `metric:${TTag}:count`]: number;
};

export type TraceShard<TTag extends string> = {
  readonly [K in `trace:${TTag}:id`]: Brand<string, TTag>;
};

export type RuntimeShard<TTag extends string> = {
  readonly [K in `runtime:${TTag}:state`]: 'ready' | 'running' | 'failed';
};

export type PlanShard<TTag extends string> = {
  readonly [K in `plan:${TTag}:version`]: {
    readonly version: number;
    readonly metadata: {
      readonly tags: readonly TTag[];
    };
  };
};

export type TelemetryShard<TTag extends string> = {
  readonly [K in `telemetry:${TTag}:sample`]: { readonly at: number; readonly payload: Readonly<Record<string, number>> };
};

export type DecisionShard<TTag extends string> = {
  readonly [K in `decision:${TTag}:kind`]: 'observe' | 'repair' | 'contain';
};

export type PolicyIntersection<TTag extends string> = PolicyShard<TTag> &
  ConstraintShard<TTag> &
  MetricShard<TTag>;

export type CollapseShard<T> = T extends object
  ? {
      [K in keyof T]: T[K];
    }
  : never;

export type ComposeIntersections<T extends readonly string[]> = {
  [K in keyof T]: T[K] extends string ? PolicyIntersection<T[K]> : never;
} extends infer R extends readonly unknown[]
  ? {
      [I in keyof R]: R[I];
    }
  : never;

export type Intersect<TA, TB> = TA & TB;

export type FoldIntersections<T extends readonly unknown[], Acc = {}> = T extends readonly [infer H, ...infer R]
  ? FoldIntersections<R, Intersect<Acc & H, {}>>
  : Acc;

export type FlattenIntersection<T> = T extends infer U
  ? { [K in keyof U]: U[K] }
  : never;

export type PolicyIntersectionMap<T extends ReadonlyArray<string>> = {
  readonly [K in T[number]]: PolicyIntersection<K & string>;
};

export type FoldedPolicy<T extends ReadonlyArray<string>> = PolicyIntersection<T[number] & string>;

export type PolicyUnion<T extends ReadonlyArray<string>> = PolicyShard<T[number] & string> | ConstraintShard<T[number] & string>;

export type DistributivePolicy<T extends ReadonlyArray<string>> = T[number] extends infer K
  ? K extends string
    ? PolicyIntersection<K>
    : never
  : never;

export type IntersectionQuery<T extends ReadonlyArray<string>> = FoldedPolicy<T> & {
  readonly active: T[number] | 'global';
};

export type ProfileEnvelope<T extends ReadonlyArray<string>> = {
  readonly shards: PolicyIntersectionMap<T>;
  readonly union: PolicyUnion<T>;
  readonly query: IntersectionQuery<T>;
  readonly folded: FlattenIntersection<IntersectionQuery<T>>;
};

export type MergeWithBrand<T> = T & {
  readonly __brand?: `merged:${string}`;
};

export const policyShardKeys = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
] as const satisfies readonly string[];

const policyRecords = policyShardKeys.reduce<Record<string, unknown>>((acc, key, index) => {
  const policy = `policy-${key}` as const;
  const constraint = `constraint-${key}:domain` as const;
  const metric = `metric-${key}:count` as const;
  const trace = `trace-${key}:id` as const;
  const runtime = `runtime-${key}:state` as const;
  const plan = `plan-${key}:version` as const;
  const telemetry = `telemetry-${key}:sample` as const;
  const decision = `decision-${key}:kind` as const;
  acc[policy] = true;
  acc[constraint] = key;
  acc[metric] = index;
  acc[trace] = `trace-id-${index}` as Brand<string, typeof key>;
  acc[runtime] = index % 2 === 0 ? 'ready' : 'running';
  acc[plan] = index + 1;
  acc[telemetry] = { at: Date.now() + index, payload: { [key]: index } };
  acc[decision] = index % 3 === 0 ? 'observe' : index % 3 === 1 ? 'repair' : 'contain';
  return acc;
}, {});

export const policyIntersectionRecord = policyRecords as unknown as Record<string, unknown>;

export type FoldedPolicyByMap =
  PolicyShard<'alpha'> &
  ConstraintShard<'beta'> &
  MetricShard<'gamma'>;

export type IntersectionsEnvelope = ProfileEnvelope<typeof policyShardKeys>;

export const policyIntersectionFixture = {
  shards: (() => {
    const shardMap = policyShardKeys.reduce((acc, key) => {
    acc[key as keyof PolicyIntersectionMap<typeof policyShardKeys>] = {
      [`policy:${key}:enabled`]: true,
      [`constraint:${key}:domain`]: key,
      [`metric:${key}:count`]: key.length,
      [`trace:${key}:id`]: `${key}-trace` as Brand<string, typeof key>,
      [`runtime:${key}:state`]: 'ready',
      [`plan:${key}:version`]: {
        version: key.length,
        metadata: {
          tags: [key],
        },
      } as any,
      [`telemetry:${key}:sample`]: {
        at: Date.now(),
        payload: { [key]: key.length },
      },
      [`decision:${key}:kind`]: key.length % 3 === 0 ? 'observe' : 'repair',
    } as unknown as PolicyIntersection<string>;
    return acc;
    }, {} as Record<string, PolicyIntersection<string>>);
    return shardMap as PolicyIntersectionMap<typeof policyShardKeys>;
  })(),
  union: {
    [`policy:alpha:enabled`]: true,
  } as PolicyUnion<typeof policyShardKeys>,
  query: {
    active: 'global',
    [`policy:alpha:enabled`]: true,
  } as unknown as IntersectionQuery<typeof policyShardKeys>,
  folded: {} as unknown as { readonly active: typeof policyShardKeys[number] | 'global' },
} as IntersectionsEnvelope;
