import type { Brand, DeepReadonly, JsonValue } from '@shared/type-level';

export type ConvergenceDomain = 'incident' | 'drill' | 'workflow' | 'fabric' | 'signal';
export type ConvergenceTier = 'l1' | 'l2' | 'l3';
export type ConvergenceHealth = 'critical' | 'degraded' | 'stable';
export type ConvergencePhase = 'discover' | 'prioritize' | 'simulate' | 'rehearse' | 'verify' | 'close';

export type ConvergenceDomainId = Brand<string, 'ConvergenceDomainId'>;
export type ConvergenceRunId = Brand<string, 'ConvergenceRunId'>;
export type ConvergencePlanId = Brand<string, 'ConvergencePlanId'>;
export type ConvergencePluginId = Brand<string, 'ConvergencePluginId'>;
export type ConvergenceWorkspaceId = Brand<string, 'ConvergenceWorkspaceId'>;

export type ConvergenceScopedId<TPrefix extends string, TName extends string> = Brand<
  `${TPrefix}:${TName}`,
  'ConvergenceScopedId'
>;

export type NonEmptyTuple<T, TLength extends number = 1> = TLength extends 0
  ? never
  : readonly [T, ...readonly T[]];

export type Repeat<
  T,
  N extends number,
  Acc extends readonly T[] = readonly [],
> = Acc['length'] extends N
  ? Acc
  : Repeat<T, N, readonly [...Acc, T]>;

export type ZipToPairs<T> =
  T extends readonly [infer A, ...infer Rest]
    ? Rest extends readonly [infer B, ...infer _]
      ? [[A, B], ...ZipToPairs<Rest>]
      : []
    : [];

export type Segment<T extends string, Prefix extends string = ''> = Prefix extends ''
  ? T
  : `${Prefix}.${T}`;

export type NestedKeys<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? NestedKeys<T[K], Segment<K, Prefix>>
        : Segment<K, Prefix>;
    }[keyof T & string]
  : never;

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? [Head, ...FlattenTuple<Rest>]
  : [];

export type RemappedRecord<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord as `field_${Extract<K, string>}`]: DeepReadonly<TRecord[K]>;
};

export type ConvergenceState<TRecord extends string = string> = {
  [K in TRecord]: {
    [S in ConvergencePhase]?: {
      value: number;
      tags: NonEmptyTuple<string>;
      at: string;
    };
  };
};

export type WithMappedKeys<T> = {
  [K in keyof T as `v1_${K & string}`]: T[K];
};

export type ConvergenceTagName<TPrefix extends string, TKind extends string> = `${TPrefix}:${TKind}`;

export interface ConvergenceTag {
  readonly key: ConvergenceTagName<'tag', string>;
  readonly value: string;
}

export interface ConvergenceSignal {
  readonly id: Brand<string, 'ConvergenceSignalId'>;
  readonly source: string;
  readonly tier: ConvergenceTier;
  readonly score: number;
  readonly domain: ConvergenceDomain;
  readonly tags: readonly ConvergenceTag[];
  readonly observedAt: string;
}

export interface ConvergencePlanStep<TArgs extends readonly unknown[] = readonly unknown[]> {
  readonly id: ConvergencePlanId;
  readonly name: string;
  readonly command: string;
  readonly arguments: TArgs;
  readonly reversible: boolean;
  readonly dependencies: readonly string[];
}

export interface ConvergencePlan {
  readonly id: ConvergencePlanId;
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly title: string;
  readonly score: number;
  readonly steps: readonly ConvergencePlanStep[];
  readonly constraints: ReadonlyMap<string, number>;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface ConvergenceWorkspace {
  readonly id: ConvergenceWorkspaceId;
  readonly domainId: ConvergenceDomainId;
  readonly policyId: string;
  readonly domain: ConvergenceDomain;
  readonly health: ConvergenceHealth;
  readonly planBudget: number;
  readonly signals: readonly ConvergenceSignal[];
  readonly plans: readonly ConvergencePlan[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConvergenceRunMetrics {
  readonly latencyP50: number;
  readonly latencyP95: number;
  readonly successRate: number;
  readonly recoveryReadiness: number;
  readonly riskScore: number;
}

export interface ConvergenceRunEvent {
  readonly type: 'phase' | 'metric' | 'command' | 'error';
  readonly at: string;
  readonly phase?: ConvergencePhase;
  readonly runId: ConvergenceRunId;
  readonly payload: JsonValue;
}

export interface ConvergenceRunResult {
  readonly runId: ConvergenceRunId;
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly durationMs: number;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed';
  readonly selectedPlan?: ConvergencePlan;
  readonly metrics: ConvergenceRunMetrics;
  readonly events: readonly ConvergenceRunEvent[];
}

export interface ConvergenceAdapterContext {
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly runId: ConvergenceRunId;
  readonly phase: ConvergencePhase;
  readonly startedAt: string;
}

export interface ConvergenceAdapterSpec<TInput extends object = object, TOutput extends object = object> {
  readonly id: ConvergenceScopedId<'adapter', string>;
  readonly input: TInput;
  readonly output: TOutput;
}

export type ConvergenceEnvelope<T> = DeepReadonly<{
  readonly runId: ConvergenceRunId;
  readonly timestamp: string;
  readonly payload: T;
}>;

export type InferRunInput<T> = T extends { readonly payload: infer P } ? P : never;

export type RemapWorkspace<T> = {
  [K in keyof T as `workspace_${Extract<K, string>}`]: T[K];
};

export type PluginByPhase<TPlugins extends readonly ConvergencePluginDescriptor[]> = {
  [Phase in ConvergencePhase]: Extract<
    TPlugins[number],
    {
      readonly stages: readonly (ConvergencePhase | string)[];
    }
  >[];
};

export type ConvergencePluginConfig<TProfile extends string = string> = {
  readonly profile: TProfile;
  readonly tags: readonly ConvergenceTag[];
  readonly enabled: boolean;
  readonly metadata?: Record<string, JsonValue>;
};

export interface ConvergencePluginDescriptor {
  readonly id: ConvergencePluginId;
  readonly label: string;
  readonly stages: readonly ConvergencePhase[];
  readonly dependencies: readonly ConvergencePluginId[];
  readonly config: ConvergencePluginConfig;
  readonly weight: number;
}

export type PhaseSelector =
  | ConvergencePhase
  | (string & { readonly __phaseWildcard: never });

export type PluginResult<TOutput> = {
  readonly output: DeepReadonly<TOutput>;
  readonly events: readonly ConvergenceRunEvent[];
  readonly trace: {
    readonly stage: ConvergencePhase;
    readonly elapsedMs: number;
    readonly plugin: ConvergencePluginId;
  };
};
